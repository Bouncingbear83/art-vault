import { supabase } from "@/integrations/supabase/client";

/**
 * The Book reads public.book_screen and renders it. Nothing here decides a
 * buy or a skip: the gate arithmetic lives upstream in comps_rollup, and every
 * derivation below is presentation only (dots, chips, RAG light, freshness).
 */

export interface BookScreenRow {
  artist_id: string;
  display_name: string;
  dates: string | null;
  play_type: string | null;
  tier: string | null;
  arr_status: string | null;
  palette_pref: string | null;
  paper_sleeve: boolean | null;
  buy_edge_flag: string | null;
  median_realisation: number | null;
  buy_regional_realisation: number | null;
  matched_spread: number | null;
  spread_trusted: boolean | null;
  thin_exit_flag: boolean | null;
  data_confidence: string | null;
  sell_through_pct: number | null;
  median_uk_hammer_gbp: number | null;
  exit_vs_regional_spread: number | null;
  level_read: string | null;
  n_exit_strong: number | null;
  n_buy_regional: number | null;
  comps_updated_at: string | null;
  open_flags: number | null;
}

export const PLAY_ORDER = ["Arbitrage", "Paper", "Quality_hold", "Pending"] as const;

export type GateState = "p" | "f" | "n";
export type Rag = "g" | "a" | "r";

export interface BookViewRow extends BookScreenRow {
  play: string;
  gate: [GateState, GateState, GateState];
  fails: number;
  thin: boolean;
  room: number | null;
  fresh: number | null;
  flags: string[];
  rag: Rag;
  verdict: string;
  gov: { text: string; basis: string; sort: number | null; noRoom: boolean };
}

export async function fetchBookScreen(): Promise<BookScreenRow[]> {
  const { data, error } = await supabase
    .from("book_screen" as never)
    .select("*")
    .order("display_name");
  if (error) throw error;
  return (data ?? []) as unknown as BookScreenRow[];
}

/* ------------------------------- derivation ------------------------------ */

const FRESH_WINDOW_DAYS = 90;

function freshnessDays(updatedAt: string | null): number | null {
  if (!updatedAt) return null;
  const ms = Date.now() - new Date(updatedAt).getTime();
  if (Number.isNaN(ms)) return null;
  return FRESH_WINDOW_DAYS - Math.floor(ms / 86_400_000);
}

/** Paper names are grouped in their own lane regardless of the artists row. */
function laneOf(r: BookScreenRow): string {
  if (r.paper_sleeve) return "Paper";
  const p = r.play_type ?? "Pending";
  return (PLAY_ORDER as readonly string[]).includes(p) ? p : "Pending";
}

function unseeded(r: BookScreenRow): boolean {
  return (
    r.comps_updated_at === null ||
    (r.n_exit_strong === null && r.buy_regional_realisation === null && r.buy_edge_flag === null)
  );
}

function gateOf(r: BookScreenRow, lane: string): [GateState, GateState, GateState] {
  const na = r.paper_sleeve === true || lane === "Paper" || unseeded(r);
  if (na) return ["n", "n", "n"];
  const n = r.n_exit_strong;
  const left: GateState = n === null ? "n" : n >= 8 ? "p" : "f";
  const room = r.buy_regional_realisation;
  const mid: GateState = room === null ? "n" : room < 1.0 ? "p" : "f";
  const right: GateState =
    r.matched_spread !== null && r.spread_trusted === true ? "p" : left === "n" ? "n" : "f";
  return [left, mid, right];
}

function flagsOf(r: BookScreenRow, fresh: number | null): string[] {
  const out: string[] = [];
  if (unseeded(r)) out.push("unseeded");
  if (r.paper_sleeve) out.push("paper-sleeve");
  const room = r.buy_regional_realisation;
  if (room !== null && room >= 1.0) out.push("no-room");
  if ((r.n_exit_strong ?? 0) < 8 && !unseeded(r)) out.push("thin-exit");
  if (
    r.exit_vs_regional_spread !== null &&
    Number(r.exit_vs_regional_spread) >= 3 &&
    (r.n_exit_strong ?? 0) < 8
  )
    out.push("mirage");
  if (r.buy_edge_flag === "None" && (r.n_exit_strong ?? 0) < 8 && room !== null && room >= 1.0)
    out.push("drop-watch");
  if (laneOf(r) === "Pending" && room === null && !unseeded(r)) out.push("no-lane");
  if ((r.median_uk_hammer_gbp ?? 0) >= 10_000) out.push("ceiling-breach");
  if (r.arr_status && !/^(clear|unknown|arr expired)/i.test(r.arr_status)) out.push("ARR");
  if (r.data_confidence === "Low") out.push("data-fix");
  if (fresh !== null && fresh <= 0) out.push("stale");
  if ((r.open_flags ?? 0) > 0) out.push(`${r.open_flags} open`);
  return out;
}

/** Presentation-only roll-up. Never a buy gate. */
export function rag(r: {
  fresh: number | null;
  flags: string[];
  play: string;
  buy_regional_realisation: number | null;
  n_exit_strong: number | null;
  matched_spread: number | null;
  spread_trusted: boolean | null;
}): Rag {
  const stale = r.fresh !== null && r.fresh <= 0;
  const flags = r.flags ?? [];
  if (flags.includes("no-lane")) return "r";
  if (flags.includes("drop-watch") && stale) return "r";
  if (
    r.play === "Pending" &&
    !flags.includes("post-sale") &&
    (r.buy_regional_realisation === null || r.buy_regional_realisation >= 1.0)
  )
    return "r";
  const clean =
    (r.n_exit_strong ?? 0) >= 8 &&
    r.buy_regional_realisation !== null &&
    r.buy_regional_realisation < 1.0 &&
    r.matched_spread !== null &&
    r.spread_trusted === true;
  if (clean && !stale && !flags.includes("drop-watch")) return "g";
  return "a";
}

const gbp0 = (n: number | null) =>
  n == null ? "—" : "£" + Math.round(Number(n)).toLocaleString("en-GB");

function govOf(r: BookScreenRow) {
  if (r.paper_sleeve) {
    return {
      text: gbp0(r.median_uk_hammer_gbp),
      basis: "oil median · see Grain",
      sort: r.median_uk_hammer_gbp == null ? null : Number(r.median_uk_hammer_gbp),
      noRoom: false,
    };
  }
  if (r.median_uk_hammer_gbp == null) {
    return { text: "—", basis: unseeded(r) ? "unseeded" : "no median", sort: null, noRoom: false };
  }
  const room = r.buy_regional_realisation;
  return {
    text: gbp0(r.median_uk_hammer_gbp),
    basis: "oil median",
    sort: Number(r.median_uk_hammer_gbp),
    noRoom: room !== null && room >= 1.0,
  };
}

/** Short headline. v1.1 will read the current vault Verdict note instead. */
function verdictOf(r: BookScreenRow, flags: string[]): string {
  if (flags.includes("unseeded")) return "Config not yet seeded; no rollup row to read.";
  if (r.paper_sleeve)
    return "Paper-sleeve name: the oil median is not the thesis. Read the ceiling in Grain.";
  if (flags.includes("no-lane")) return "No home-market walk-away derivable; lane not live.";
  if (r.thin_exit_flag) return "Thin exit (n<8): anchor is noise. Watch, do not bid off it.";
  switch (r.buy_edge_flag) {
    case "Real":
      return "Edge survives all three gates; lane live within the tier table.";
    case "Thin":
      return "Edge not size-confirmed; chase individually mispriced lots only.";
    case "None":
      return "Market competes it up; no open-auction room at present.";
    default:
      return "No rollup verdict yet.";
  }
}

export function toViewRow(r: BookScreenRow): BookViewRow {
  const play = laneOf(r);
  const fresh = freshnessDays(r.comps_updated_at);
  const flags = flagsOf(r, fresh);
  const gate = gateOf(r, play);
  return {
    ...r,
    play,
    gate,
    fails: gate.filter((g) => g === "f").length,
    thin: gate[0] !== "p",
    room: r.buy_regional_realisation === null ? null : Number(r.buy_regional_realisation),
    fresh,
    flags,
    verdict: verdictOf(r, flags),
    gov: govOf(r),
    rag: rag({
      fresh,
      flags,
      play,
      buy_regional_realisation:
        r.buy_regional_realisation === null ? null : Number(r.buy_regional_realisation),
      n_exit_strong: r.n_exit_strong,
      matched_spread: r.matched_spread,
      spread_trusted: r.spread_trusted,
    }),
  };
}

export const WARN_FLAGS = [
  "no-lane",
  "drop-watch",
  "no-room",
  "mirage",
  "re-rating",
  "print-flood",
  "stale",
  "thin-exit",
];
export const DUE_FLAGS = ["unseeded", "data-fix", "ARR"];

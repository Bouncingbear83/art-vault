import { supabase } from "@/integrations/supabase/client";

/**
 * The Book reads public.book_screen and renders it. Nothing here decides a
 * buy or a skip: the quant lives upstream in comps_rollup, and every derivation
 * below is presentation only (chips, RAG light, freshness).
 *
 * v7.2 collector grammar: the surface no longer asserts an arbitrage edge.
 * The §H triptych is retained as a demoted diagnostic (legs 1-2 only; leg 3
 * "size-band control" was never built, so its dot reads n/a, not fail). The
 * RAG light and verdict headline read the collector backdrop: is the name
 * priceable (level_read), liquid (sell_through), and does its zone pay.
 */

export interface BookScreenRow {
  artist_id: string;
  display_name: string;
  dates: string | null;
  play_type: string | null;
  tier: string | null;
  arr_status: string | null;
  palette_pref: string | null;
  mutualart_url: string | null;
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
  /* v7.2 collector columns */
  price_cagr_full: number | null;
  sell_through_trend: string | null;
  ceiling_breach: boolean | null;
  zone_fitness: string | null;
  zone_conf: string | null;
  zone_sellthrough_premium_pp: number | null;
}

/* Arbitrage retired in v7.2; Paper derives from paper_sleeve, not play_type. */
export const PLAY_ORDER = ["Paper", "Quality_hold", "Pending"] as const;

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

/**
 * §H diagnostic dots (demoted, legs 1-2 only). Left: Exit_Strong n >= 8.
 * Middle: Buy_Regional realisation < 1.0. Right: size-band control (leg 3) is
 * NOT computed, so it reads n/a whenever matched_spread is null, never "fail".
 */
function gateOf(r: BookScreenRow, lane: string): [GateState, GateState, GateState] {
  const na = r.paper_sleeve === true || lane === "Paper" || unseeded(r);
  if (na) return ["n", "n", "n"];
  const n = r.n_exit_strong;
  const left: GateState = n === null ? "n" : n >= 8 ? "p" : "f";
  const room = r.buy_regional_realisation;
  const mid: GateState = room === null ? "n" : room < 1.0 ? "p" : "f";
  const right: GateState =
    r.matched_spread === null ? "n" : r.spread_trusted === true ? "p" : "f";
  return [left, mid, right];
}

function flagsOf(r: BookScreenRow, fresh: number | null): string[] {
  const out: string[] = [];
  if (unseeded(r)) out.push("unseeded");
  if (r.paper_sleeve) out.push("paper-sleeve");
  if (laneOf(r) === "Pending" && r.median_uk_hammer_gbp === null && !unseeded(r))
    out.push("no-lane");
  if ((r.n_exit_strong ?? 0) < 8 && !unseeded(r) && !r.paper_sleeve) out.push("thin-data");
  if (r.zone_fitness === "Inverted") out.push("zone-inverted");
  if (r.ceiling_breach === true || (r.median_uk_hammer_gbp ?? 0) >= 10_000)
    out.push("ceiling-breach");
  if (r.arr_status && !/^(clear|unknown|arr expired)/i.test(r.arr_status)) out.push("ARR");
  if (r.data_confidence === "Low") out.push("data-fix");
  if (fresh !== null && fresh <= 0) out.push("stale");
  if ((r.open_flags ?? 0) > 0) out.push(`${r.open_flags} open`);
  return out;
}

/**
 * Presentation-only roll-up, collector grammar. Never a buy gate.
 * Live (green): priceable (level known), liquid (sell-through >= 60), fresh,
 * seeded, not paper. Parked (red): no priceable lane. Else Watch (amber).
 */
export function rag(r: {
  fresh: number | null;
  flags: string[];
  paper_sleeve: boolean | null;
  median_uk_hammer_gbp: number | null;
  sell_through_pct: number | null;
  level_read: string | null;
}): Rag {
  const stale = r.fresh !== null && r.fresh <= 0;
  const flags = r.flags ?? [];
  if (flags.includes("no-lane")) return "r";
  if (!r.paper_sleeve && r.median_uk_hammer_gbp == null) return "r";
  const liquid = (r.sell_through_pct ?? 0) >= 60;
  const priceable = r.level_read != null && r.level_read !== "Unknown";
  const green =
    !r.paper_sleeve &&
    liquid &&
    priceable &&
    !stale &&
    !flags.includes("unseeded");
  if (green) return "g";
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
  return {
    text: gbp0(r.median_uk_hammer_gbp),
    basis: "oil median",
    sort: Number(r.median_uk_hammer_gbp),
    noRoom: false,
  };
}

/** Short collector headline. v1.1 will read the current vault Verdict note. */
function verdictOf(r: BookScreenRow, flags: string[]): string {
  if (flags.includes("unseeded")) return "Config not yet seeded; no rollup row to read.";
  if (r.paper_sleeve)
    return "Paper-sleeve name: the oil median is not the thesis. Read the ceiling in Grain.";
  if (flags.includes("no-lane")) return "No home-market oil median; lane not priceable.";

  const bits: string[] = [];
  const lvl = r.level_read && r.level_read !== "Unknown" ? r.level_read.toLowerCase() : null;
  if (lvl) bits.push(`priced ${lvl} vs own history`);

  const st = r.sell_through_pct;
  if (st != null) bits.push(st >= 80 ? "very liquid" : st >= 60 ? "liquid" : "thin turnover");

  switch (r.zone_fitness) {
    case "Pays":
      bits.push("zone pays");
      break;
    case "Liquidity_only":
      bits.push("zone adds liquidity only");
      break;
    case "Price_only":
      bits.push("zone adds price only");
      break;
    case "Inverted":
      bits.push("zone inverted: in-zone underperforms");
      break;
    case "Neutral":
      bits.push("zone neutral");
      break;
  }

  if (r.ceiling_breach) bits.push("exits above ~£10k ceiling");

  if (!bits.length) return "Collector backdrop pending more comps.";
  const s = bits.join("; ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
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
      paper_sleeve: r.paper_sleeve,
      median_uk_hammer_gbp:
        r.median_uk_hammer_gbp === null ? null : Number(r.median_uk_hammer_gbp),
      sell_through_pct: r.sell_through_pct === null ? null : Number(r.sell_through_pct),
      level_read: r.level_read,
    }),
  };
}

export const WARN_FLAGS = [
  "no-lane",
  "zone-inverted",
  "stale",
  "thin-data",
];
export const DUE_FLAGS = ["unseeded", "data-fix", "ARR"];

// Browser-side data layer for the Lot Desk UI. Reuses the SAME pure scorer as
// the MCP tools; no logic lives here. New relations are read/written through an
// untyped client view so the UI compiles regardless of types.ts regeneration.
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreLot, type Decision, type LotInput, type ScoreBundle } from "@/lib/desk/score";
import { loadScoreInputs } from "@/lib/desk/slices";

const sb = supabase as unknown as SupabaseClient;
const num = (v: unknown): number | null => (v == null ? null : Number(v));

/* ------------------------------ controlled vocab (mirrors the Vocab tab) --- */

export const SUBJECTS = [
  "Venice", "Harbour/Marine", "Beach", "Market/Street", "River/City", "Brittany",
  "Lake/Como", "Nile/Egypt", "Ruins/Antiquity", "Floral/Still-life",
  "Mountain/Alpine", "Townscape", "Pastoral", "Interior", "Other",
] as const;
export const PALETTES = ["Sunlit", "Grey", "Neutral", "Moonlit"] as const;
export const AUTHORSHIPS = [
  "Autograph", "Attributed", "Manner_of", "Circle_of", "After", "Follower_of", "Reproduction",
] as const;

/* ------------------------------ score + commit ---------------------------- */

export interface LotForm {
  artist_id: string;
  title: string;
  authorship: string;
  medium_raw: string;
  medium_class: string;
  longest_cm: number;
  subject: string;
  palette: string;
  in_zone: "" | "In" | "Skip";
  est_low: number | null;
  est_high: number | null;
  currency: string;
  venue: string;
  sale_date: string;
  bp_pct: number | null;
  strong_venue_candidate: boolean;
  quality_delta: number | null;
  quality_override_reason: string;
  condition: string;
  sheet_grade: string;
  condition_checked: boolean;
  provenance_note: string;
  sale_context: string;
  taste_ok: boolean;
}

export const emptyLot = (): LotForm => ({
  artist_id: "", title: "", authorship: "Autograph", medium_raw: "oil on canvas",
  medium_class: "", longest_cm: 0, subject: "", palette: "Sunlit", in_zone: "",
  est_low: null, est_high: null, currency: "GBP", venue: "", sale_date: "",
  bp_pct: null, strong_venue_candidate: false, quality_delta: null,
  quality_override_reason: "", condition: "", sheet_grade: "", condition_checked: false,
  provenance_note: "", sale_context: "", taste_ok: true,
});

function toLotInput(f: LotForm): LotInput {
  return {
    artist_id: f.artist_id,
    title: f.title,
    authorship: f.authorship,
    medium_raw: f.medium_raw,
    medium_class: f.medium_class || null,
    longest_cm: f.longest_cm,
    subject: f.subject,
    palette: f.palette,
    est_low: f.est_low,
    est_high: f.est_high,
    currency: f.currency,
    venue: f.venue,
    sale_date: f.sale_date,
    bp_pct: f.bp_pct,
    strong_venue_candidate: f.strong_venue_candidate,
    quality_delta: f.quality_delta,
    quality_override_reason: f.quality_override_reason || null,
    condition: f.condition || null,
    sheet_grade: f.sheet_grade || null,
    condition_checked: f.condition_checked,
    provenance_note: f.provenance_note || null,
    sale_context: f.sale_context || null,
    taste_ok: f.taste_ok,
    ...(f.in_zone === "In" || f.in_zone === "Skip" ? { in_zone: f.in_zone } : {}),
  };
}

export async function scoreLotClient(f: LotForm): Promise<Decision> {
  if (!f.artist_id) throw new Error("Choose an artist.");
  if (!f.sale_date) throw new Error("Set a sale date.");
  const period_year = Number(f.sale_date.slice(0, 4));
  const { comps, config, params, budget } = await loadScoreInputs(sb, f.artist_id, period_year);
  if (!config) throw new Error(`No desk config for "${f.artist_id}".`);
  const bundle: ScoreBundle = { lot: toLotInput(f), comps, config, params, budget };
  return scoreLot(bundle);
}

export interface CommitActuals {
  hammer_paid_gbp: number;
  house: string;
  condition_status: string;
  buy_date: string;
  rationale: string;
}

export interface CommitResult {
  position_id: string;
  lot_note_id: string;
  all_in_gbp: number;
  over_walkaway: boolean;
}

export async function commitLotClient(f: LotForm, act: CommitActuals): Promise<CommitResult> {
  const d = await scoreLotClient(f);
  const K = d.K_buy;
  const all_in = Math.round(act.hammer_paid_gbp * K);
  const sale_key = d.lot.sale_key;
  const buy_date = act.buy_date || new Date().toISOString().slice(0, 10);
  const firm = d.ladder.firm;
  const over = firm != null && act.hammer_paid_gbp > firm;

  const body =
    (d.vault?.note_body ?? `GRAIN: ${d.lane} lane.`) +
    `\n\nACTUALS: hammer £${act.hammer_paid_gbp}, all-in £${all_in}, K_buy ${K}, house ${act.house || f.venue}.` +
    (over ? `\n\nFLAG: paid above firm £${firm}.` : "");

  const { data: note, error: nErr } = await sb
    .from("notes")
    .insert({
      note_type: "Lot",
      scope: "Lot",
      artist_id: f.artist_id,
      entity_key: sale_key,
      decision: "Buy",
      action_status: "Open",
      play_type: "NA",
      confidence: "Med",
      valid_from: buy_date,
      valid_to: d.vault?.valid_to ?? null,
      source_ref: sale_key,
      body,
      created_by: "desk-ui",
    })
    .select("note_id")
    .single();
  if (nErr) throw nErr;

  const { data: pos, error: pErr } = await sb
    .from("positions")
    .insert({
      artist_id: f.artist_id,
      title: f.title,
      sale_key,
      house: act.house || f.venue,
      hammer_gbp: act.hammer_paid_gbp,
      all_in_gbp: all_in,
      buy_date,
      condition_status: act.condition_status || f.condition || null,
      subject: f.subject,
      palette: f.palette,
      longest_cm: f.longest_cm,
      rationale: act.rationale || d.rationale,
      params_id: d.params_id,
      lot_note_id: note.note_id,
    })
    .select("position_id")
    .single();
  if (pErr) throw new Error(`Note ${note.note_id} written, but position insert failed: ${pErr.message}`);

  return { position_id: pos.position_id, lot_note_id: note.note_id, all_in_gbp: all_in, over_walkaway: over };
}

/* ------------------------------ ledger + config reads --------------------- */

export interface PositionRow {
  position_id: string;
  artist_id: string | null;
  artist_name: string | null;
  title: string | null;
  house: string | null;
  hammer_gbp: number | null;
  all_in_gbp: number | null;
  buy_date: string | null;
  subject: string | null;
  palette: string | null;
  condition_status: string | null;
  rationale: string | null;
}

type RawPos = Omit<PositionRow, "artist_name"> & { artists: { display_name: string | null } | null };

export async function fetchPositions(): Promise<PositionRow[]> {
  const { data, error } = await sb
    .from("positions")
    .select(
      "position_id, artist_id, title, house, hammer_gbp, all_in_gbp, buy_date, subject, palette, condition_status, rationale, artists(display_name)",
    )
    .order("buy_date", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as RawPos[]).map((r) => ({
    position_id: r.position_id,
    artist_id: r.artist_id,
    artist_name: r.artists?.display_name ?? r.artist_id,
    title: r.title,
    house: r.house,
    hammer_gbp: num(r.hammer_gbp),
    all_in_gbp: num(r.all_in_gbp),
    buy_date: r.buy_date,
    subject: r.subject,
    palette: r.palette,
    condition_status: r.condition_status,
    rationale: r.rationale,
  }));
}

export interface BudgetRow {
  period_year: number;
  envelope_gbp: number;
  committed_gbp: number;
}

export async function fetchBudget(year: number): Promise<BudgetRow | null> {
  const { data, error } = await sb.from("budget").select("*").eq("period_year", year).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    period_year: Number(r["period_year"]),
    envelope_gbp: Number(r["envelope_gbp"]),
    committed_gbp: Number(r["committed_gbp"]),
  };
}

export interface DeskParamsRow {
  collector_discount_firm: number;
  collector_discount_stretch: number;
  stale_haircut: number;
  remote_haircut: number;
  bp_pct_default: number;
  vat_premium: number;
  arr_rate: number;
  n_gate: number;
  homogeneity_threshold: number;
  recency_cutoff: number;
}

export async function fetchDeskParams(): Promise<DeskParamsRow | null> {
  const { data, error } = await sb.from("desk_params_current").select("*").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    collector_discount_firm: Number(r["collector_discount_firm"]),
    collector_discount_stretch: Number(r["collector_discount_stretch"]),
    stale_haircut: Number(r["stale_haircut"]),
    remote_haircut: Number(r["remote_haircut"]),
    bp_pct_default: Number(r["bp_pct_default"]),
    vat_premium: Number(r["vat_premium"]),
    arr_rate: Number(r["arr_rate"]),
    n_gate: Number(r["n_gate"]),
    homogeneity_threshold: Number(r["homogeneity_threshold"]),
    recency_cutoff: Number(r["recency_cutoff"]),
  };
}

export interface DeskConfigRow {
  artist_id: string;
  artist_name: string | null;
  discount_class: string;
  discount_override_firm: number | null;
  discount_override_stretch: number | null;
  commission_floor_gbp: number | null;
  min_longest_cm: number | null;
  paper_primary: boolean;
  paper_ceiling_gbp: number | null;
  arr_active_until: string | null;
}

type RawCfg = {
  artist_id: string; discount_class: string; discount_override_firm: number | null;
  discount_override_stretch: number | null; commission_floor_gbp: number | null;
  min_longest_cm: number | null; paper_primary: boolean; paper_ceiling_gbp: number | null;
  arr_active_until: string | null; artists: { display_name: string | null } | null;
};

export async function fetchDeskConfigAll(): Promise<DeskConfigRow[]> {
  const { data, error } = await sb
    .from("artist_desk_config")
    .select(
      "artist_id, discount_class, discount_override_firm, discount_override_stretch, commission_floor_gbp, min_longest_cm, paper_primary, paper_ceiling_gbp, arr_active_until, artists(display_name)",
    );
  if (error) throw error;
  return ((data ?? []) as unknown as RawCfg[])
    .map((r) => ({
      artist_id: r.artist_id,
      artist_name: r.artists?.display_name ?? r.artist_id,
      discount_class: r.discount_class,
      discount_override_firm: num(r.discount_override_firm),
      discount_override_stretch: num(r.discount_override_stretch),
      commission_floor_gbp: num(r.commission_floor_gbp),
      min_longest_cm: r.min_longest_cm == null ? null : Number(r.min_longest_cm),
      paper_primary: r.paper_primary === true,
      paper_ceiling_gbp: num(r.paper_ceiling_gbp),
      arr_active_until: r.arr_active_until,
    }))
    .sort((a, b) => (a.artist_name ?? "").localeCompare(b.artist_name ?? ""));
}

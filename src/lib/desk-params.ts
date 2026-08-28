// Params read/write for the /desk/params surface.
//
// Deliberately a SEPARATE module from desk-ui.ts: the write path is new and
// desk-ui.ts is long enough that re-pasting it to add three exports is a
// corruption risk. Nothing here changes existing behaviour.
//
// Architecture note (mandate: gate logic lives in Supabase, not TypeScript):
// the preview below recomputes the ARITHMETIC of the ladder only (firm hammer,
// all-in, ceiling). It does NOT re-derive band_verdict. Verdicts re-cut
// server-side when the params row is ratified and the view is re-read. Do not
// be tempted to mirror the CASE ladder here; that is how the two drift apart.
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

const sb = supabase as unknown as SupabaseClient;
const num = (v: unknown): number | null => (v == null ? null : Number(v));

/* ------------------------------ params (full row) ------------------------- */

export interface DeskParamsFull {
  params_id: string;
  effective_from: string;
  collector_discount_firm: number;
  collector_discount_stretch: number;
  stale_haircut: number;
  remote_haircut: number;
  bp_pct_default: number;
  vat_premium: number;
  arr_rate: number;
  n_gate: number;
  band_n_gate: number;
  homogeneity_threshold: number;
  recency_cutoff: number;
  sleeve_ceiling_multiple: number | null;
  band_factor_cap: number | null;
  band_floor_gbp: number | null;
  note: string | null;
}

export async function fetchDeskParamsFull(): Promise<DeskParamsFull | null> {
  const { data, error } = await sb.from("desk_params_current").select("*").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    params_id: String(r["params_id"]),
    effective_from: String(r["effective_from"]),
    collector_discount_firm: Number(r["collector_discount_firm"]),
    collector_discount_stretch: Number(r["collector_discount_stretch"]),
    stale_haircut: Number(r["stale_haircut"]),
    remote_haircut: Number(r["remote_haircut"]),
    bp_pct_default: Number(r["bp_pct_default"]),
    vat_premium: Number(r["vat_premium"]),
    arr_rate: Number(r["arr_rate"]),
    n_gate: Number(r["n_gate"]),
    band_n_gate: Number(r["band_n_gate"]),
    homogeneity_threshold: Number(r["homogeneity_threshold"]),
    recency_cutoff: Number(r["recency_cutoff"]),
    sleeve_ceiling_multiple: num(r["sleeve_ceiling_multiple"]),
    band_factor_cap: num(r["band_factor_cap"]),
    band_floor_gbp: num(r["band_floor_gbp"]),
    note: (r["note"] as string) ?? null,
  };
}

/**
 * Write a new effective-dated params row.
 *
 * desk_params is APPEND-NEVER-MUTATE and the standing hazard is that a new row
 * silently resets values nobody thought about (band_factor_cap did exactly
 * this). The RPC copies every unchanged column forward from
 * desk_params_current, so this client never has to know the full column list.
 * A rationale is mandatory and enforced server-side.
 */
export async function ratifyDeskParams(p: {
  discount_firm: number;
  discount_stretch: number;
  band_floor_gbp: number;
  note: string;
}): Promise<string> {
  if (!p.note.trim()) throw new Error("A rationale is required to ratify params.");
  const { data, error } = await sb.rpc("ratify_desk_params", {
    p_discount_firm: p.discount_firm,
    p_discount_stretch: p.discount_stretch,
    p_band_floor_gbp: p.band_floor_gbp,
    p_note: p.note.trim(),
  });
  if (error) throw error;
  return String(data);
}

/* ------------------------------ budget ------------------------------------ */

export interface BudgetFull {
  period_year: number;
  envelope_gbp: number;
  committed_gbp: number;
  target_works: number | null;
}

export async function fetchBudgetFull(year: number): Promise<BudgetFull | null> {
  const { data, error } = await sb.from("budget").select("*").eq("period_year", year).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    period_year: Number(r["period_year"]),
    envelope_gbp: Number(r["envelope_gbp"]),
    committed_gbp: Number(r["committed_gbp"]),
    target_works: num(r["target_works"]),
  };
}

export async function saveBudget(p: {
  period_year: number;
  envelope_gbp: number;
  target_works: number;
}): Promise<void> {
  const { error } = await sb
    .from("budget")
    .update({
      envelope_gbp: p.envelope_gbp,
      target_works: p.target_works,
      updated_at: new Date().toISOString(),
    })
    .eq("period_year", p.period_year);
  if (error) throw error;
  // committed_gbp is deliberately NOT writable here: it is maintained by the
  // positions trigger. Typing over it would decouple the envelope from the
  // ledger and the budget gate would stop meaning anything.
}

/* ------------------------------ buy bands --------------------------------- */

export interface BuyBandRow {
  artist_id: string;
  band_label: string;
  sort_order: number;
  band_verdict: string;
  n_sold: number;
  n_sold_recent: number;
  n_unsold: number;
  band_median_gbp: number | null;
  recent_median_gbp: number | null;
  recency_drift: number | null;
  k_buy: number;
  firm_hammer_gbp: number | null;
  all_in_at_firm_gbp: number | null;
  band_floor_gbp: number | null;
  band_ceiling_gbp: number | null;
  band_n_gate: number;
}

export async function fetchBuyBands(): Promise<BuyBandRow[]> {
  const { data, error } = await sb
    .from("artist_buy_band")
    .select(
      "artist_id, band_label, sort_order, band_verdict, n_sold, n_sold_recent, n_unsold, band_median_gbp, recent_median_gbp, recency_drift, k_buy, firm_hammer_gbp, all_in_at_firm_gbp, band_floor_gbp, band_ceiling_gbp, band_n_gate",
    );
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    artist_id: String(r["artist_id"]),
    band_label: String(r["band_label"]),
    sort_order: Number(r["sort_order"]),
    band_verdict: String(r["band_verdict"]),
    n_sold: Number(r["n_sold"]),
    n_sold_recent: Number(r["n_sold_recent"]),
    n_unsold: Number(r["n_unsold"]),
    band_median_gbp: num(r["band_median_gbp"]),
    recent_median_gbp: num(r["recent_median_gbp"]),
    recency_drift: num(r["recency_drift"]),
    k_buy: Number(r["k_buy"]),
    firm_hammer_gbp: num(r["firm_hammer_gbp"]),
    all_in_at_firm_gbp: num(r["all_in_at_firm_gbp"]),
    band_floor_gbp: num(r["band_floor_gbp"]),
    band_ceiling_gbp: num(r["band_ceiling_gbp"]),
    band_n_gate: Number(r["band_n_gate"]),
  }));
}

/** Slug to a readable name; artist_buy_band is a view, so no FK join to artists. */
export const prettyArtist = (slug: string): string =>
  slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** Ceiling implied by an envelope, a works target and a firm discount. */
export const impliedCeiling = (envelope: number, works: number, dFirm: number): number =>
  works > 0 && dFirm < 1 ? Math.round(envelope / works / (1 - dFirm)) : 0;

/**
 * Arithmetic-only preview of a candidate discount. Verdicts are NOT recomputed:
 * they re-cut server-side on ratify. `crosses` flags a band whose recent median
 * moves across the implied ceiling, which is the one verdict change worth
 * warning about before the write.
 */
export interface BandPreview extends BuyBandRow {
  new_firm_gbp: number | null;
  new_all_in_gbp: number | null;
  crosses: "enters" | "leaves" | null;
}

export function previewBands(
  rows: BuyBandRow[],
  dFirm: number,
  ceiling: number,
  floor: number,
): BandPreview[] {
  return rows.map((r) => {
    const priceable = r.recent_median_gbp != null && r.n_sold_recent >= r.band_n_gate;
    const m = r.recent_median_gbp;
    const new_all_in = priceable && m != null ? Math.round(m * (1 - dFirm)) : null;
    const new_firm = priceable && m != null ? Math.round((m * (1 - dFirm)) / r.k_buy) : null;

    let crosses: "enters" | "leaves" | null = null;
    if (priceable && m != null) {
      const inNow = r.band_verdict === "Core";
      const inNew = m >= floor && m <= ceiling;
      if (!inNow && inNew) crosses = "enters";
      if (inNow && !inNew) crosses = "leaves";
    }
    return { ...r, new_firm_gbp: new_firm, new_all_in_gbp: new_all_in, crosses };
  });
}

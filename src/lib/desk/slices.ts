// ============================================================================
// Lot Desk v0.6 :: fetch layer. The ONLY IO for scoring.
// Accepts the untyped client so it works from both callers unchanged:
//   - the MCP tool  (supabaseForUser(ctx) returns an untyped client)
//   - the UI        (the typed browser `supabase` client)
// The pure scorer (score.ts) does all slicing/median/dispersion in memory;
// this module is a dumb fetch that maps rows to the scorer's interfaces.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { UK_TIERS, type CompRow, type DeskConfig, type DeskParams, type BudgetRow } from "./score";

const num = (v: unknown): number => (v == null ? NaN : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

export interface ArtistHit { artist_id: string; display_name: string }

/** Resolve a free-text artist query to roster candidates (caller disambiguates). */
export async function resolveArtist(sb: SupabaseClient, query: string): Promise<ArtistHit[]> {
  const q = query.trim();
  const { data, error } = await sb
    .from("artists")
    .select("artist_id, display_name")
    .or(`artist_id.eq.${q},display_name.ilike.%${q}%`)
    .limit(10);
  if (error) throw new Error(`artist resolve failed: ${error.message}`);
  return (data ?? []).map((r: { artist_id: string; display_name: string }) => ({
    artist_id: r.artist_id,
    display_name: r.display_name,
  }));
}

/** Realised UK autograph oil+watercolour comps for one artist (hammer_equiv not null). */
export async function fetchArtistComps(sb: SupabaseClient, artist_id: string): Promise<CompRow[]> {
  const { data, error } = await sb
    .from("comps")
    .select("hammer_equiv_gbp, in_zone, vtype_resolved, medium_class, longest_cm, sale_date")
    .eq("artist_id", artist_id)
    .eq("authorship", "Autograph")
    .in("medium_class", ["Oil", "Watercolour"])
    .in("vtype_resolved", UK_TIERS as unknown as string[])
    .not("hammer_equiv_gbp", "is", null);
  if (error) throw new Error(`comps fetch failed: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>): CompRow => ({
    hammer_equiv_gbp: num(r["hammer_equiv_gbp"]),
    in_zone: (r["in_zone"] as string | null) ?? null,
    vtype_resolved: (r["vtype_resolved"] as string | null) ?? null,
    medium_class: (r["medium_class"] as string | null) ?? null,
    longest_cm: numOrNull(r["longest_cm"]),
    sale_date: (r["sale_date"] as string | null) ?? null,
  }));
}

export async function fetchDeskConfig(sb: SupabaseClient, artist_id: string): Promise<DeskConfig | null> {
  const { data, error } = await sb
    .from("artist_desk_config")
    .select("*")
    .eq("artist_id", artist_id)
    .maybeSingle();
  if (error) throw new Error(`desk config fetch failed: ${error.message}`);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    artist_id: r["artist_id"] as string,
    discount_class: (r["discount_class"] as string) ?? "quality_hold_wanted",
    discount_override_firm: numOrNull(r["discount_override_firm"]),
    discount_override_stretch: numOrNull(r["discount_override_stretch"]),
    commission_floor_gbp: numOrNull(r["commission_floor_gbp"]),
    min_longest_cm: r["min_longest_cm"] == null ? null : Math.round(Number(r["min_longest_cm"])),
    strong_venue_default: r["strong_venue_default"] === true,
    paper_primary: r["paper_primary"] === true,
    paper_ceiling_gbp: numOrNull(r["paper_ceiling_gbp"]),
    arr_active_until: (r["arr_active_until"] as string | null) ?? null,
  };
}

export async function fetchDeskParams(sb: SupabaseClient): Promise<DeskParams> {
  const { data, error } = await sb.from("desk_params_current").select("*").maybeSingle();
  if (error) throw new Error(`desk params fetch failed: ${error.message}`);
  if (!data) throw new Error("no desk_params row in force: seed desk_params first");
  const r = data as Record<string, unknown>;
  return {
    params_id: r["params_id"] as string,
    collector_discount_firm: num(r["collector_discount_firm"]),
    collector_discount_stretch: num(r["collector_discount_stretch"]),
    stale_haircut: num(r["stale_haircut"]),
    remote_haircut: num(r["remote_haircut"]),
    bp_pct_default: num(r["bp_pct_default"]),
    vat_premium: num(r["vat_premium"]),
    arr_rate: num(r["arr_rate"]),
    n_gate: Math.round(num(r["n_gate"])),
    homogeneity_threshold: num(r["homogeneity_threshold"]),
    recency_cutoff: Math.round(num(r["recency_cutoff"])),
  };
}

export async function fetchBudget(sb: SupabaseClient, period_year: number): Promise<BudgetRow | null> {
  const { data, error } = await sb
    .from("budget")
    .select("period_year, envelope_gbp, committed_gbp")
    .eq("period_year", period_year)
    .maybeSingle();
  if (error) throw new Error(`budget fetch failed: ${error.message}`);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    period_year: Math.round(num(r["period_year"])),
    envelope_gbp: num(r["envelope_gbp"]),
    committed_gbp: num(r["committed_gbp"]),
  };
}

export interface ScoreInputs {
  comps: CompRow[];
  config: DeskConfig | null;
  params: DeskParams;
  budget: BudgetRow | null;
}

/** One call to assemble everything the scorer needs for a lot. */
export async function loadScoreInputs(
  sb: SupabaseClient,
  artist_id: string,
  period_year: number,
): Promise<ScoreInputs> {
  const [comps, config, params, budget] = await Promise.all([
    fetchArtistComps(sb, artist_id),
    fetchDeskConfig(sb, artist_id),
    fetchDeskParams(sb),
    fetchBudget(sb, period_year),
  ]);
  return { comps, config, params, budget };
}

// Sanctioned write paths and history reads for /desk/params.
//
// desk_params is APPEND-NEVER-MUTATE. The only two write paths are the RPCs
// ratify_desk_params and apply_sleeve_multiple; both stamp app.write_source so
// the audit trail can tell a sanctioned write from a hand-run INSERT. Nothing in
// this module ever INSERTs or UPDATEs desk_params directly.
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

const sb = supabase as unknown as SupabaseClient;
const num = (v: unknown): number | null => (v == null ? null : Number(v));

/** Postgres exception text, verbatim. Never swallowed, never rewritten. */
export function rpcErrorText(e: unknown): string {
  if (e && typeof e === "object") {
    const r = e as Record<string, unknown>;
    return [r["message"], r["details"], r["hint"]]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join(" — ");
  }
  return String(e);
}

/* ------------------------------ section 1: ratify -------------------------- */

export interface RatifyArgs {
  p_discount_firm: number;
  p_discount_stretch: number;
  p_note: string;
  p_band_floor_gbp?: number;
  p_band_n_gate?: number;
  p_band_factor_cap?: number;
  p_max_work_gbp?: number;
}

/** Only changed fields are passed; the RPC copies the rest forward. */
export async function ratifyParams(args: RatifyArgs): Promise<string> {
  const { data, error } = await sb.rpc("ratify_desk_params", args);
  if (error) throw new Error(rpcErrorText(error));
  return String(data);
}

/* ------------------------------ section 2: sleeve -------------------------- */

export interface SleeveRow {
  artist_id: string;
  inzone_finished_wc_median_gbp: number;
  paper_ceiling_gbp: number | null;
}

export async function fetchSleeveRows(): Promise<SleeveRow[]> {
  const { data, error } = await sb
    .from("artist_desk_config")
    .select("artist_id, inzone_finished_wc_median_gbp, paper_ceiling_gbp")
    .not("inzone_finished_wc_median_gbp", "is", null)
    .order("artist_id");
  if (error) throw new Error(rpcErrorText(error));
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    artist_id: String(r["artist_id"]),
    inzone_finished_wc_median_gbp: Number(r["inzone_finished_wc_median_gbp"]),
    paper_ceiling_gbp: num(r["paper_ceiling_gbp"]),
  }));
}

/** Same arithmetic the RPC applies server-side: round(median * m / 50) * 50. */
export const previewCeiling = (median: number, multiple: number): number =>
  Math.round((median * multiple) / 50) * 50;

export async function applySleeveMultiple(p_multiple: number): Promise<number> {
  const { data, error } = await sb.rpc("apply_sleeve_multiple", { p_multiple });
  if (error) throw new Error(rpcErrorText(error));
  return Number(data);
}

/* ------------------------------ section 4: history ------------------------- */

export const SANCTIONED_SOURCES = ["ratify_desk_params", "apply_sleeve_multiple"] as const;

export interface ParamsHistoryRow {
  params_id: string;
  effective_from: string;
  note: string | null;
  collector_discount_firm: number;
  collector_discount_stretch: number;
  sleeve_ceiling_multiple: number | null;
  band_floor_gbp: number | null;
  source: string | null;
  db_role: string | null;
  logged_at: string | null;
  sanctioned: boolean;
}

export async function fetchParamsHistory(): Promise<ParamsHistoryRow[]> {
  const [{ data: rows, error }, { data: audit, error: aerr }] = await Promise.all([
    sb
      .from("desk_params")
      .select(
        "params_id, effective_from, note, collector_discount_firm, collector_discount_stretch, sleeve_ceiling_multiple, band_floor_gbp",
      )
      .order("effective_from", { ascending: false }),
    sb.from("desk_params_write_audit").select("params_id, source, db_role, logged_at"),
  ]);
  if (error) throw new Error(rpcErrorText(error));
  if (aerr) throw new Error(rpcErrorText(aerr));

  const byId = new Map<string, Record<string, unknown>>();
  for (const a of (audit ?? []) as unknown as Record<string, unknown>[]) {
    const id = a["params_id"] == null ? null : String(a["params_id"]);
    if (id) byId.set(id, a);
  }

  return ((rows ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const id = String(r["params_id"]);
    const a = byId.get(id);
    const source = a ? String(a["source"]) : null;
    return {
      params_id: id,
      effective_from: String(r["effective_from"]),
      note: (r["note"] as string) ?? null,
      collector_discount_firm: Number(r["collector_discount_firm"]),
      collector_discount_stretch: Number(r["collector_discount_stretch"]),
      sleeve_ceiling_multiple: num(r["sleeve_ceiling_multiple"]),
      band_floor_gbp: num(r["band_floor_gbp"]),
      source,
      db_role: a ? String(a["db_role"]) : null,
      logged_at: a ? String(a["logged_at"]) : null,
      // no audit row at all is itself unsanctioned: the row predates the trigger
      // or was written around it.
      sanctioned:
        source != null && (SANCTIONED_SOURCES as readonly string[]).includes(source),
    };
  });
}

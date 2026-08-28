// Browser-side data layer for /radar.
//
// The radar is a COINCIDENT liveness and candidate-surfacing aid (§J). It reads
// public.upcoming_lots, which the nightly ingest fills, and it routes to the
// taste gate: never to a bid. Three things follow, and all three are enforced
// here rather than left to the component:
//
//   1. No ladder number is ever exposed. band_firm_hammer_gbp is a band-level,
//      median-quality, blended-tier screening figure. Showing it beside a lot
//      before the human has answered "would I be glad to own this" anchors the
//      answer, which is the one thing the taste gate exists to keep clean.
//   2. Cooling down-ranks; it never hides. Timing is falsified, so a cooling
//      band is a caveat, not a signal to stay out.
//   3. Every payload carries the stamp verbatim, so it survives a copy into a
//      vault note.
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

const sb = supabase as unknown as SupabaseClient;
const num = (v: unknown): number | null => (v == null ? null : Number(v));

export const RADAR_STAMP = "lead-falsified, coincident-only";

export type RadarLane = "candidate" | "watch" | "unclassified" | "suppressed" | "quarantine";

export const LANE_ORDER: RadarLane[] = ["candidate", "watch", "unclassified", "quarantine", "suppressed"];

export const LANE_LABEL: Record<RadarLane, string> = {
  candidate: "Candidates",
  watch: "Watch",
  unclassified: "Needs classification",
  quarantine: "Unreadable",
  suppressed: "Suppressed",
};

export const LANE_LEDE: Record<RadarLane, string> = {
  candidate: "Every machine-checkable gate passes. Only taste and headroom are left, and both are yours.",
  watch: "Scoreable, but thin, cooling, concentrated or collector-review. Look, do not price.",
  unclassified: "Subject or palette came back below the confidence floor. A question, not a rejection.",
  quarantine: "Off-roster, or missing size, date or venue. No band read is possible.",
  suppressed: "Failed a mandate gate. Kept visible so a wrong call is auditable.",
};

export interface RadarRow {
  sale_key: string;
  artist_id: string | null;
  artist_raw: string;
  artist_name: string | null;
  title: string;
  authorship: string;
  medium_class: string | null;
  subject: string | null;
  subject_confidence: number | null;
  palette: string | null;
  palette_confidence: number | null;
  in_zone: string | null;
  longest_cm: number | null;
  est_low: number | null;
  est_high: number | null;
  currency: string | null;
  venue_canonical: string | null;
  sale_date: string | null;
  band_label: string | null;
  band_verdict: string | null;
  band_firm_hammer_gbp: number | null;
  concentration_ratio: number | null;
  radar_lane: RadarLane;
  radar_reason: string | null;
  lot_url: string | null;
  source: string;
  outcome_status: string | null;
  promoted_lot_id: string | null;
}

/** Live rows only: a past-sale lot leaves the radar exactly as it leaves the desk. */
export async function fetchRadar(): Promise<RadarRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("upcoming_lots")
    .select(
      "sale_key, artist_id, artist_raw, title, authorship, medium_class, subject, subject_confidence, palette, palette_confidence, in_zone, longest_cm, est_low, est_high, currency, venue_canonical, sale_date, band_label, band_verdict, band_firm_hammer_gbp, radar_lane, radar_reason, lot_url, source, outcome_status, promoted_lot_id, artists(display_name)",
    )
    .is("promoted_lot_id", null)
    .is("dismissed_at", null)
    .gte("sale_date", today)
    .order("sale_date", { ascending: true });
  if (error) throw error;

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    sale_key: String(r["sale_key"]),
    artist_id: (r["artist_id"] as string | null) ?? null,
    artist_raw: String(r["artist_raw"] ?? ""),
    artist_name:
      ((r["artists"] as { display_name?: string } | null)?.display_name ?? null) ||
      (r["artist_raw"] as string | null) ||
      null,
    title: String(r["title"] ?? ""),
    authorship: String(r["authorship"] ?? ""),
    medium_class: (r["medium_class"] as string | null) ?? null,
    subject: (r["subject"] as string | null) ?? null,
    subject_confidence: num(r["subject_confidence"]),
    palette: (r["palette"] as string | null) ?? null,
    palette_confidence: num(r["palette_confidence"]),
    in_zone: (r["in_zone"] as string | null) ?? null,
    longest_cm: num(r["longest_cm"]),
    est_low: num(r["est_low"]),
    est_high: num(r["est_high"]),
    currency: (r["currency"] as string | null) ?? null,
    venue_canonical: (r["venue_canonical"] as string | null) ?? null,
    sale_date: (r["sale_date"] as string | null) ?? null,
    band_label: (r["band_label"] as string | null) ?? null,
    band_verdict: (r["band_verdict"] as string | null) ?? null,
    band_firm_hammer_gbp: num(r["band_firm_hammer_gbp"]),
    concentration_ratio: null as number | null,
    radar_lane: (r["radar_lane"] as RadarLane) ?? "quarantine",
    radar_reason: (r["radar_reason"] as string | null) ?? null,
    lot_url: (r["lot_url"] as string | null) ?? null,
    source: String(r["source"] ?? ""),
    outcome_status: (r["outcome_status"] as string | null) ?? null,
    promoted_lot_id: (r["promoted_lot_id"] as string | null) ?? null,
  }));

  // Concentration is a cadence caveat carried on the band, not the lot.
  const { data: bands } = await sb
    .from("artist_buy_band")
    .select("artist_id, band_label, concentration_ratio");
  const conc = new Map(
    ((bands ?? []) as unknown as Record<string, unknown>[]).map((b) => [
      `${b["artist_id"]}|${b["band_label"]}`,
      num(b["concentration_ratio"]),
    ]),
  );
  for (const r of rows) {
    if (r.artist_id && r.band_label) r.concentration_ratio = conc.get(`${r.artist_id}|${r.band_label}`) ?? null;
  }

  return rows;
}

/**
 * Within a lane: soonest sale first, because the only thing the radar is
 * genuinely competent to rank on is what needs looking at before it goes.
 * Cooling sinks within its lane; it is never removed.
 */
export function sortLane(rows: RadarRow[]): RadarRow[] {
  return [...rows].sort((a, b) => {
    const aCool = a.band_verdict === "Cooling" ? 1 : 0;
    const bCool = b.band_verdict === "Cooling" ? 1 : 0;
    if (aCool !== bCool) return aCool - bCool;
    return (a.sale_date ?? "9999-12-31").localeCompare(b.sale_date ?? "9999-12-31");
  });
}

export function groupByLane(rows: RadarRow[]): Record<RadarLane, RadarRow[]> {
  const out = {
    candidate: [] as RadarRow[], watch: [] as RadarRow[], unclassified: [] as RadarRow[],
    quarantine: [] as RadarRow[], suppressed: [] as RadarRow[],
  };
  for (const r of rows) out[r.radar_lane]?.push(r);
  for (const k of Object.keys(out) as RadarLane[]) out[k] = sortLane(out[k]);
  return out;
}

/** Dismiss a surfaced lot. Recorded, never deleted: a wrong pass should be auditable. */
export async function dismissRadarLot(sale_key: string, reason: string): Promise<void> {
  const { error } = await sb
    .from("upcoming_lots")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ dismissed_at: new Date().toISOString(), dismissed_reason: reason } as any)
    .eq("sale_key", sale_key);
  if (error) throw error;
}

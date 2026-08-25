// src/lib/desk/persist.ts
// Canonical mapping: a scorer Decision + its LotInput -> a public.lots upsert row.
// Shared by every writer (MCP score_lot, the desk-ui manual form, the nightly
// radar) so the candidate ledger has ONE shape regardless of capture path.
// Pure: no IO. Keyed on sale_key (one live row per lot; callers upsert).
import type { Decision, LotInput } from "./score";

export type CapturedBy = "claude" | "manual" | "radar";

const STATUS_FROM_DECISION: Record<Decision["decision"], string> = {
  Buy: "open",
  Monitor: "monitor",
  Skip: "skipped",
};

export interface LotRowMeta {
  captured_by: CapturedBy;
  source_ref?: string | null;
  classification_confidence?: number | null; // radar/LLM stamp; null for human capture
  scored_at?: string; // ISO; defaults to now
}

export type LotRow = Record<string, unknown>;

/**
 * Build the lots row. Note on status: this maps the scorer decision to an OPEN
 * lifecycle state. A terminal state ('won'/'lost') is set by the caller AFTER
 * this (commit spreads { ...row, status: 'won' }); do not re-score a won lot
 * through the bare mapper or it would reopen it.
 */
export function lotRowFromDecision(d: Decision, lot: LotInput, meta: LotRowMeta): LotRow {
  const a = d.anchor;
  return {
    sale_key: d.lot.sale_key,
    artist_id: d.lot.artist_id,

    // provenance / lifecycle
    captured_by: meta.captured_by,
    source_ref: meta.source_ref ?? null,
    classification_confidence: meta.classification_confidence ?? null,
    status: STATUS_FROM_DECISION[d.decision] ?? "open",

    // input contract
    title: lot.title,
    authorship: lot.authorship,
    medium_raw: lot.medium_raw,
    medium_class: lot.medium_class ?? null,
    subject: lot.subject,
    palette: lot.palette,
    palette_kw_only: lot.palette_keyword_only ?? false,
    longest_cm: lot.longest_cm ?? null,
    est_low: lot.est_low ?? null,
    est_high: lot.est_high ?? null,
    currency: lot.currency ?? null,
    venue: lot.venue ?? null,
    sale_date: lot.sale_date ?? null,
    in_zone: lot.in_zone ?? null,

    // hard human gates
    strong_venue_candidate: lot.strong_venue_candidate ?? false,
    quality_delta_input: lot.quality_delta ?? null,
    quality_override_reason: lot.quality_override_reason ?? null,
    taste_ok: lot.taste_ok ?? null,
    condition_checked: lot.condition_checked ?? false,
    condition_note: lot.condition ?? null,
    provenance_note: lot.provenance_note ?? null,
    sale_context: lot.sale_context ?? null,
    sheet_grade: lot.sheet_grade ?? null,

    // scorer output snapshot
    decision: d.decision,
    binding_constraint: d.binding_constraint,
    lane: d.lane,
    fair_value_gbp: a.fair_value,
    anchor_tier: a.tier,
    anchor_rung: a.rung,
    anchor_n: a.n,
    anchor_confidence: a.confidence,
    quality_delta_value: d.quality_delta?.value ?? null,
    k_buy: d.K_buy,
    ladder_firm_gbp: d.ladder.firm,
    ladder_stretch_gbp: d.ladder.stretch,
    ladder_tightened_gbp: d.ladder.tightened,
    ladder_commission_gbp: d.ladder.commission,
    all_in_at_firm_gbp: d.all_in_at_firm,
    budget_ok: d.budget_ok,
    params_id: d.params_id,
    flags: d.flags ?? [],
    decision_json: { lot, decision: d },

    scored_at: meta.scored_at ?? new Date().toISOString(),
  };
}

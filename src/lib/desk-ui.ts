// Browser-side data layer for the Lot Desk UI. Reuses the SAME pure scorer as
// the MCP tools; no logic lives here. New relations are read/written through an
// untyped client view so the UI compiles regardless of types.ts regeneration.
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreLot, type Decision, type LotInput, type ScoreBundle } from "@/lib/desk/score";
import { loadScoreInputs } from "@/lib/desk/slices";
import { lotRowFromDecision, type LotRowMeta } from "@/lib/desk/persist";

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
  const { comps, bands, config, params, budget } = await loadScoreInputs(sb, f.artist_id, period_year);
  if (!config) throw new Error(`No desk config for "${f.artist_id}".`);
  const bundle: ScoreBundle = { lot: toLotInput(f), comps, config, params, budget, bands: bands ?? [] };
  return scoreLot(bundle);
}

export interface CommitActuals {
  hammer_paid_gbp: number;
  house: string;
  condition_status: string;
  buy_date: string;
  rationale: string;
  commit_override_reason?: string;
}

/** Ladder guard shared by the UI and the MCP commit path. */
export function commitLadderGuard(
  hammer: number,
  firm: number | null,
  stretch: number | null,
): { tooHigh: boolean; tooLow: boolean; message: string | null } {
  const ceiling = stretch ?? firm;
  const tooHigh = ceiling != null && hammer > ceiling;
  const tooLow = firm != null && hammer < firm * 0.25;
  const message = tooHigh
    ? `hammer £${hammer} exceeds the scored ${stretch != null ? "stretch" : "firm"} bid of £${ceiling}; supply a reason to record it anyway`
    : tooLow
      ? `hammer £${hammer} is under a quarter of the firm bid of £${firm}; this reads as a stale or mistyped figure. Supply a reason if it is real`
      : null;
  return { tooHigh, tooLow, message };
}

export interface CommitResult {
  position_id: string;
  lot_note_id: string;
  all_in_gbp: number;
  over_walkaway: boolean;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Spec §8: a Lot note expires the day after the sale, WHATEVER the decision.
 * The scorer only emits a `vault` block on the Buy path, so keying valid_to off
 * `d.vault` left every Monitor and Skip note evergreen: they never fell out of
 * the default non-expired search and silently went stale (the §I.5 staleness
 * fault, re-entering on the Lot note type). Derive it from sale_date instead;
 * honour the scorer's value when it supplies one.
 */
export function lotValidTo(sale_date: string | null, vaultValidTo?: string | null): string | null {
  if (vaultValidTo) return vaultValidTo;
  if (!sale_date) return null;
  const d = new Date(`${sale_date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The I.5-grammar body, built for any decision (not just Buy). */
function verdictBody(f: LotForm, d: Decision, extra?: string): string {
  const a = d.anchor;
  const grain = a.fair_value != null
    ? `GRAIN: rung ${a.rung}, n=${a.n}, ${a.tier}, fair £${a.fair_value}.`
    : `GRAIN: ${d.lane} lane, no anchor (${a.flags.join(", ") || "n/a"}).`;
  const money = (n: number | null) => (n != null ? `£${n}` : "—");
  const finding = `FINDING: δ ${d.quality_delta.value}; firm ${money(d.ladder.firm)}, stretch ${money(d.ladder.stretch)}; all-in ${money(d.all_in_at_firm)}.`;
  const read = `READ: ${d.decision}${d.binding_constraint ? ` (${d.binding_constraint})` : ""}. ${f.title} — ${f.venue}, ${f.sale_date}.`;
  const flags = `FLAGS: ${d.flags.length ? d.flags.join("; ") : "none"}.`;
  return [grain, finding, read, flags, extra].filter(Boolean).join("\n\n");
}

/** Upsert a Lot note keyed by sale_key: one note per lot, updated in place. */
async function upsertLotNote(p: {
  sale_key: string; artist_id: string; decision: "Buy" | "Skip" | "Monitor";
  body: string; valid_to: string | null; valid_from: string;
}): Promise<string> {
  const payload = {
    note_type: "Lot", scope: "Lot", artist_id: p.artist_id,
    entity_key: p.sale_key, source_ref: p.sale_key,
    decision: p.decision, action_status: "Open", play_type: "NA", confidence: "Med",
    valid_from: p.valid_from, valid_to: p.valid_to, body: p.body, created_by: "desk-ui",
  };
  const { data: existing, error: selErr } = await sb
    .from("notes").select("note_id").eq("note_type", "Lot").eq("source_ref", p.sale_key).limit(1).maybeSingle();
  if (selErr) throw selErr;
  if (existing?.note_id) {
    const { error } = await sb.from("notes").update(payload).eq("note_id", existing.note_id);
    if (error) throw error;
    return existing.note_id as string;
  }
  const { data, error } = await sb.from("notes").insert(payload).select("note_id").single();
  if (error) throw error;
  return data.note_id as string;
}

/**
 * Upsert the structured candidate row (public.lots) keyed on sale_key.
 *
 * `capture` exists so a lot promoted off the radar keeps its provenance:
 * captured_by='radar', the listing URL, and the LLM's classification stamp.
 * It is the SAME mapper either way. The radar must never get its own writer,
 * or the ledger stops having one shape.
 */
export async function upsertLotRow(
  f: LotForm,
  d: Decision,
  capture?: Partial<LotRowMeta>,
): Promise<void> {
  const row = lotRowFromDecision(d, toLotInput(f), {
    captured_by: capture?.captured_by ?? "manual",
    source_ref: capture?.source_ref ?? null,
    classification_confidence: capture?.classification_confidence ?? null,
  });
  const { error } = await sb.from("lots").upsert(row, { onConflict: "sale_key" });
  if (error) throw error;
}

/* --------------------------- radar promotion ------------------------------ */

/**
 * Hydrate the score form from a radar-surfaced row.
 *
 * Two things this deliberately does NOT carry across:
 *   taste_ok            forced false. The radar has no taste value and must not
 *                       supply one; the form makes the human answer before the
 *                       ladder is computed. emptyLot() defaults it true, which
 *                       would silently answer the gate on a promoted lot.
 *   strong_venue_candidate  forced false: the anti-mirage default. Venue type is
 *                       never inferred from the listing.
 *
 * `venue` is hydrated from venue_canonical, not the raw string, so the desk
 * recomputes exactly the sale_key the radar minted and the upsert lands on the
 * same row rather than forking it.
 */
export interface RadarHydration {
  form: LotForm;
  sale_key: string;
  source_ref: string | null;
  classification_confidence: number | null;
  band_verdict: string | null;
  band_label: string | null;
  radar_reason: string | null;
  subject_confidence: number | null;
  palette_confidence: number | null;
}

export async function hydrateFromUpcoming(sale_key: string): Promise<RadarHydration> {
  const { data, error } = await sb
    .from("upcoming_lots")
    .select(
      "sale_key, artist_id, title, authorship, medium_raw, medium_class, subject, palette, subject_confidence, palette_confidence, in_zone, longest_cm, est_low, est_high, currency, venue_canonical, sale_date, lot_url, source_ref, band_verdict, band_label, radar_reason",
    )
    .eq("sale_key", sale_key)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No radar row for ${sale_key}.`);
  const r = data as Record<string, unknown>;
  if (!r["artist_id"]) throw new Error("This lot has no roster artist, so it cannot be scored.");

  const s = (v: unknown) => (v == null ? "" : String(v));
  const n = (v: unknown): number | null => (v == null ? null : Number(v));
  const subject_confidence = n(r["subject_confidence"]);
  const palette_confidence = n(r["palette_confidence"]);

  const form: LotForm = {
    ...emptyLot(),
    artist_id: s(r["artist_id"]),
    title: s(r["title"]),
    authorship: s(r["authorship"]) || "Autograph",
    medium_raw: s(r["medium_raw"]),
    medium_class: s(r["medium_class"]),
    longest_cm: Number(r["longest_cm"] ?? 0),
    subject: s(r["subject"]),
    palette: s(r["palette"]) || "Sunlit",
    in_zone: r["in_zone"] === "In" || r["in_zone"] === "Skip" ? (r["in_zone"] as "In" | "Skip") : "",
    est_low: n(r["est_low"]),
    est_high: n(r["est_high"]),
    currency: s(r["currency"]) || "GBP",
    venue: s(r["venue_canonical"]),
    sale_date: s(r["sale_date"]),
    strong_venue_candidate: false,
    condition_checked: false,
    taste_ok: false,
  };

  // The confidence stamp on the ledger is the weaker of the two machine calls.
  const conf =
    subject_confidence == null && palette_confidence == null
      ? null
      : Math.min(subject_confidence ?? 1, palette_confidence ?? 1);

  return {
    form,
    sale_key: s(r["sale_key"]),
    source_ref: (r["lot_url"] as string | null) ?? (r["source_ref"] as string | null) ?? null,
    classification_confidence: conf,
    band_verdict: (r["band_verdict"] as string | null) ?? null,
    band_label: (r["band_label"] as string | null) ?? null,
    radar_reason: (r["radar_reason"] as string | null) ?? null,
    subject_confidence,
    palette_confidence,
  };
}

/** Link the radar row to the ledger row it became. It then leaves /radar. */
export async function markUpcomingPromoted(sale_key: string): Promise<void> {
  const { data } = await sb.from("lots").select("lot_id").eq("sale_key", sale_key).maybeSingle();
  const lot_id = (data as { lot_id?: string } | null)?.lot_id ?? null;
  if (!lot_id) return; // scored under a different key: leave it on the radar rather than orphan it
  const { error } = await sb
    .from("upcoming_lots")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ promoted_lot_id: lot_id, promoted_at: new Date().toISOString() } as any)
    .eq("sale_key", sale_key);
  if (error) throw error;
}

/** Auto-log on every score: writes the verdict note AND the structured candidate row. */
export async function logVerdict(
  f: LotForm,
  d: Decision,
  capture?: Partial<LotRowMeta>,
): Promise<void> {
  await upsertLotNote({
    sale_key: d.lot.sale_key, artist_id: f.artist_id, decision: d.decision,
    body: verdictBody(f, d, `SCORED: ${todayISO()}.`),
    valid_to: lotValidTo(f.sale_date, d.vault?.valid_to ?? null), valid_from: todayISO(),
  });
  await upsertLotRow(f, d, capture);
  if (capture?.captured_by === "radar") await markUpcomingPromoted(d.lot.sale_key);
}


export async function commitLotClient(f: LotForm, act: CommitActuals): Promise<CommitResult> {
  const d = await scoreLotClient(f);
  const K = d.K_buy;
  const all_in = Math.round(act.hammer_paid_gbp * K);
  const sale_key = d.lot.sale_key;
  const buy_date = act.buy_date || todayISO();
  const firm = d.ladder.firm;
  const stretch = d.ladder.stretch;
  const over = firm != null && act.hammer_paid_gbp > firm;

  // Refusal gate before any write: a wrong hammer propagates to positions,
  // all_in_gbp and, via the positions trigger, to budget.committed_gbp.
  const guard = commitLadderGuard(act.hammer_paid_gbp, firm, stretch);
  const outside = guard.tooHigh || guard.tooLow;
  if (outside && !act.commit_override_reason?.trim()) throw new Error(guard.message!);

  const actuals =
    `ACTUALS: hammer £${act.hammer_paid_gbp}, all-in £${all_in}, K_buy ${K}, house ${act.house || f.venue}.` +
    (over ? ` FLAG: paid above firm £${firm}.` : "") +
    (outside ? `\n\nFLAGS: commit outside ladder. ${act.commit_override_reason!.trim()}` : "");

  // one Lot note per lot: the verdict note becomes the committed record
  const note_id = await upsertLotNote({
    sale_key, artist_id: f.artist_id, decision: "Buy",
    body: verdictBody(f, d, actuals),
    valid_to: lotValidTo(f.sale_date, d.vault?.valid_to ?? null), valid_from: buy_date,
  });

  // upsert the position by sale_key so a re-commit doesn't duplicate
  const posPayload = {
    artist_id: f.artist_id, title: f.title, sale_key, house: act.house || f.venue,
    hammer_gbp: act.hammer_paid_gbp, all_in_gbp: all_in, buy_date,
    condition_status: act.condition_status || f.condition || null, subject: f.subject,
    palette: f.palette, longest_cm: f.longest_cm, rationale: act.rationale || d.rationale,
    params_id: d.params_id, lot_note_id: note_id,
  };
  const { data: existingPos, error: posSelErr } = await sb
    .from("positions").select("position_id").eq("sale_key", sale_key).limit(1).maybeSingle();
  if (posSelErr) throw posSelErr;
  let position_id: string;
  if (existingPos?.position_id) {
    const { error } = await sb.from("positions").update(posPayload).eq("position_id", existingPos.position_id);
    if (error) throw error;
    position_id = existingPos.position_id as string;
  } else {
    const { data, error } = await sb.from("positions").insert(posPayload).select("position_id").single();
    if (error) throw new Error(`Note ${note_id} written, but position insert failed: ${error.message}`);
    position_id = data.position_id as string;
  }

    // graduate the candidate row: won + links (upsert so a never-scored lot still lands)
  const wonRow = lotRowFromDecision(d, toLotInput(f), { captured_by: "manual", source_ref: sale_key });
  const { error: gErr } = await sb.from("lots").upsert(
    {
      ...wonRow, status: "won", position_id, lot_note_id: note_id,
      // the realised figure lives on the candidate row as well as the position,
      // so the Deal Log can compute vs-firm without joining positions
      result_hammer_gbp: act.hammer_paid_gbp, result_captured_at: buy_date,
    },
    { onConflict: "sale_key" },
  );
  if (gErr) console.warn("lots graduation failed:", gErr.message);

  return { position_id, lot_note_id: note_id, all_in_gbp: all_in, over_walkaway: over };
}

/* ------------------------------ deal log ---------------------------------- */

/**
 * The log reads the STRUCTURED ledger (public.lots), not the Lot note bodies.
 * Rendering the bodies made the log a second copy of the desk: same rows, same
 * content, different typography. Its only non-duplicative job is calibration:
 * what did I say I would pay, what did the lot actually make, and was my
 * walk-away too tight (mandate §G/§H, "summed Missed_By").
 *
 * `missed_by_gbp = ladder_firm_gbp - result_hammer_gbp`, one sign convention
 * for every row:
 *   positive -> it cleared BELOW the firm walk-away; had it, passed on it.
 *               Summed across passes, this is the opportunity cost §G asks for.
 *   negative -> it went above the walk-away; the pass was correct discipline.
 * On a won lot the same figure reads as headroom: positive = paid under firm.
 * Null until a result is captured; the log never guesses one.
 */
export interface DealLogRow {
  lot_id: string;
  sale_key: string;
  artist_id: string;
  artist_name: string | null;
  title: string;
  venue: string | null;
  sale_date: string | null;
  decision: string | null;
  status: string;
  binding_constraint: string | null;
  fair_value_gbp: number | null;
  ladder_firm_gbp: number | null;
  all_in_at_firm_gbp: number | null;
  result_hammer_gbp: number | null;
  missed_by_gbp: number | null;
  scored_at: string | null;
  lot_note_id: string | null;
}

type RawLog = {
  lot_id: string; sale_key: string; artist_id: string; title: string;
  venue: string | null; sale_date: string | null; decision: string | null;
  status: string; binding_constraint: string | null; fair_value_gbp: number | null;
  ladder_firm_gbp: number | null; all_in_at_firm_gbp: number | null;
  result_hammer_gbp: number | null; scored_at: string | null; lot_note_id: string | null;
  artists: { display_name: string | null } | null;
};

export async function fetchDealLog(): Promise<DealLogRow[]> {
  const { data, error } = await sb
    .from("lots")
    .select(
      "lot_id, sale_key, artist_id, title, venue, sale_date, decision, status, binding_constraint, fair_value_gbp, ladder_firm_gbp, all_in_at_firm_gbp, result_hammer_gbp, scored_at, lot_note_id, artists(display_name)",
    )
    // deliberately unfiltered: the log is every lot ever called, buys and passes
    .order("sale_date", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as unknown as RawLog[]).map((r) => {
    const firm = num(r.ladder_firm_gbp);
    const result = num(r.result_hammer_gbp);
    return {
      lot_id: r.lot_id,
      sale_key: r.sale_key,
      artist_id: r.artist_id,
      artist_name: r.artists?.display_name ?? r.artist_id,
      title: r.title,
      venue: r.venue,
      sale_date: r.sale_date,
      decision: r.decision,
      status: r.status,
      binding_constraint: r.binding_constraint,
      fair_value_gbp: num(r.fair_value_gbp),
      ladder_firm_gbp: firm,
      all_in_at_firm_gbp: num(r.all_in_at_firm_gbp),
      result_hammer_gbp: result,
      missed_by_gbp: firm != null && result != null ? Math.round(firm - result) : null,
      scored_at: r.scored_at,
      lot_note_id: r.lot_note_id,
    };
  });
}

/** Calibration roll-up for the log header: is the ladder too tight? */
export interface DealLogSummary {
  called: number;
  bought: number;
  awaitingResult: number;
  passesWithResult: number;
  opportunityCostGbp: number;   // sum of positive missed_by on lots NOT bought
  correctPasses: number;        // cleared above the walk-away
}

export function summariseDealLog(rows: DealLogRow[]): DealLogSummary {
  const today = todayISO();
  const passes = rows.filter((r) => r.status !== "won");
  const resolved = passes.filter((r) => r.missed_by_gbp != null);
  return {
    called: rows.length,
    bought: rows.filter((r) => r.status === "won").length,
    // only lots whose sale has PASSED are chaseable; an upcoming lot has no
    // result to record yet and should not read as an outstanding chore.
    awaitingResult: passes.filter(
      (r) => r.result_hammer_gbp == null && !!r.sale_date && r.sale_date < today,
    ).length,
    passesWithResult: resolved.length,
    opportunityCostGbp: resolved.reduce((s, r) => s + Math.max(0, r.missed_by_gbp!), 0),
    correctPasses: resolved.filter((r) => r.missed_by_gbp! < 0).length,
  };
}

/** Capture a post-sale result against a called lot; this is what feeds Missed_By. */
export async function recordLotResult(p: {
  sale_key: string;
  result_hammer_gbp: number | null;  // null = unsold / bought in
  captured_at?: string;
}): Promise<void> {
  const { error } = await sb
    .from("lots")
    .update({
      result_hammer_gbp: p.result_hammer_gbp,
      result_captured_at: p.captured_at ?? todayISO(),
      status: p.result_hammer_gbp == null ? "expired" : "lost",
    })
    .eq("sale_key", p.sale_key)
    .neq("status", "won");
  if (error) throw error;
}

/* ------------------------------ candidate ledger (lots) ------------------- */

export interface ScoredLotRow {
  lot_id: string; sale_key: string; artist_id: string; artist_name: string | null;
  title: string; decision: string | null; binding_constraint: string | null;
  status: string; captured_by: string; fair_value_gbp: number | null;
  ladder_firm_gbp: number | null; ladder_stretch_gbp: number | null;
  ladder_commission_gbp: number | null; all_in_at_firm_gbp: number | null;
  anchor_tier: string | null; anchor_rung: number | null; anchor_n: number | null;
  anchor_confidence: string | null; subject: string | null; palette: string | null;
  longest_cm: number | null; venue: string | null; sale_date: string | null;
  flags: string[]; lot_note_id: string | null; source_ref: string | null;
}

const DECISION_RANK: Record<string, number> = { Buy: 0, Monitor: 1, Skip: 2 };

export async function fetchScoredLots(opts?: { includeSkipped?: boolean }): Promise<ScoredLotRow[]> {
  const statuses = opts?.includeSkipped ? ["open", "monitor", "skipped"] : ["open", "monitor"];
  const { data, error } = await sb
    .from("lots")
    .select(
      "lot_id, sale_key, artist_id, title, decision, binding_constraint, status, captured_by, fair_value_gbp, ladder_firm_gbp, ladder_stretch_gbp, ladder_commission_gbp, all_in_at_firm_gbp, anchor_tier, anchor_rung, anchor_n, anchor_confidence, subject, palette, longest_cm, venue, sale_date, flags, lot_note_id, source_ref, artists(display_name)",
    )
    .in("status", statuses)
    // The desk is the FORWARD surface: a lot whose sale has passed is history and
    // belongs to the Deal Log alone. Without this, a Monitor sat on the desk
    // indefinitely and appeared on both pages at once (the duplication fault).
    // Undated lots are kept: they are un-timetabled candidates, not stale ones.
    .or(`sale_date.gte.${todayISO()},sale_date.is.null`)
    .order("sale_date", { ascending: true })
    .limit(200);
  if (error) throw error;
  type Raw = Omit<ScoredLotRow, "artist_name"> & { artists: { display_name: string | null } | null };
  return ((data ?? []) as unknown as Raw[]).map((r) => {
    const { artists, ...rest } = r;
    return { ...rest, artist_name: artists?.display_name ?? rest.artist_id, flags: (rest.flags ?? []) as string[] };
  }).sort((a, b) => (DECISION_RANK[a.decision ?? "Skip"] ?? 3) - (DECISION_RANK[b.decision ?? "Skip"] ?? 3));
}

export interface Grain360 {
  artist_id: string; median_uk_hammer_gbp: number | null;
  in_zone_realisation: number | null; sell_through_pct: number | null;
}

/** Safe grain columns only (present in both repo and live artist_360). */
export async function fetchGrain360(): Promise<Record<string, Grain360>> {
  const { data, error } = await sb
    .from("artist_360")
    .select("artist_id, median_uk_hammer_gbp, in_zone_realisation, sell_through_pct");
  if (error) throw error;
  const out: Record<string, Grain360> = {};
  for (const r of (data ?? []) as Grain360[]) out[r.artist_id] = r;
  return out;
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

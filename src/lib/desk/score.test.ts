// Run: `bun test src/lib/desk/score.test.ts`
// The pure-formula assertions are exact and never drift. The live-slice numbers
// (fair £2,551 etc.) are a dated snapshot (Kay Exit_Strong in-zone 2023+, 2026-08);
// if comps move, update the fixture median, not the formula.
import { test, expect } from "bun:test";
import { scoreLot, type ScoreBundle, type CompRow, type DeskConfig, type DeskParams } from "./score";

const params: DeskParams = {
  params_id: "p1", collector_discount_firm: 0.25, collector_discount_stretch: 0.10,
  stale_haircut: 0.20, remote_haircut: 0.40, bp_pct_default: 0.28, vat_premium: 0.20,
  arr_rate: 0.04, n_gate: 8, homogeneity_threshold: 0.25, recency_cutoff: 2023,
};

const kayCfg: DeskConfig = {
  artist_id: "james-kay", discount_class: "quality_hold_wanted",
  discount_override_firm: null, discount_override_stretch: null, commission_floor_gbp: null,
  min_longest_cm: null, strong_venue_default: false, paper_primary: false,
  paper_ceiling_gbp: null, arr_active_until: null,
};

// 12 Exit_Strong in-zone oil comps, 2024, median £2,551, range £879-4,298.
// Sizes: only 4 fall in the 50-65 band, so rung 1 (<8) fails and rung 2 (n=12) fires.
const VALS = [879, 1200, 1400, 1514, 1900, 2502, 2600, 2900, 3200, 3600, 4000, 4298];
const CMS = [40, 45, 55, 58, 60, 62, 70, 80, 90, 100, 110, 120];
const kayComps: CompRow[] = VALS.map((v, i) => ({
  hammer_equiv_gbp: v, in_zone: "In", vtype_resolved: "Exit_Strong",
  medium_class: "Oil", longest_cm: CMS[i]!, sale_date: "2024-01-01",
}));

const kayLot = {
  artist_id: "james-kay", title: "Venice, the Salute", authorship: "Autograph",
  medium_raw: "oil on canvas", medium_class: "Oil", longest_cm: 60,
  subject: "Venice", palette: "Sunlit", currency: "GBP", venue: "Lyon & Turnbull Edinburgh",
  sale_date: "2026-09-01", strong_venue_candidate: true, taste_ok: true,
};

const bundle = (over: Partial<ScoreBundle> = {}): ScoreBundle => ({
  lot: { ...kayLot }, comps: kayComps, config: kayCfg, params,
  budget: { period_year: 2026, envelope_gbp: 50000, committed_gbp: 0 }, today: "2026-08-18",
  ...over,
});

test("Kay golden: rung-2 Exit_Strong anchor, firm £1,432 / stretch £1,718", () => {
  const d = scoreLot(bundle());
  expect(d.decision).toBe("Buy");
  expect(d.anchor.rung).toBe(2);
  expect(d.anchor.n).toBe(12);
  expect(d.anchor.tier).toBe("Exit_Strong");
  expect(d.anchor.fair_value).toBe(2551);
  expect(d.K_buy).toBe(1.336);
  expect(d.ladder.firm).toBe(1432);
  expect(d.ladder.stretch).toBe(1718);
  expect(d.all_in_at_firm).toBe(1913);
  expect(d.quality_delta.value).toBe(1.0);
  expect(d.flags).toContain("median-quality-assumed");
});

test("pure formula: H = fair * qd * (1-d) / K_buy", () => {
  const H = (fv: number, qd: number, dd: number, K: number) => Math.round((fv * qd * (1 - dd)) / K);
  expect(H(2551, 1.0, 0.25, 1.336)).toBe(1432);
  expect(H(2551, 1.0, 0.10, 1.336)).toBe(1718);
});

test("no envelope halts the bid (Monitor)", () => {
  const d = scoreLot(bundle({ budget: { period_year: 2026, envelope_gbp: 0, committed_gbp: 0 } }));
  expect(d.decision).toBe("Monitor");
  expect(d.binding_constraint).toBe("no-envelope");
  expect(d.ladder.firm).toBeNull();
});

test("taste N halts (Skip, no ladder)", () => {
  const d = scoreLot(bundle({ lot: { ...kayLot, taste_ok: false } }));
  expect(d.decision).toBe("Skip");
  expect(d.binding_constraint).toBe("taste-gate");
  expect(d.ladder.firm).toBeNull();
});

test("Grey palette is a hard skip", () => {
  const d = scoreLot(bundle({ lot: { ...kayLot, palette: "Grey" } }));
  expect(d.decision).toBe("Skip");
  expect(d.binding_constraint).toBe("palette");
});

test("out-of-zone subject is a hard skip", () => {
  const d = scoreLot(bundle({ lot: { ...kayLot, subject: "Townscape" } }));
  expect(d.decision).toBe("Skip");
  expect(d.binding_constraint).toBe("subject-zone");
});

test("thin anchor (n < n_gate) -> Monitor, no firm number", () => {
  const d = scoreLot(bundle({ comps: kayComps.slice(0, 3) }));
  expect(d.decision).toBe("Monitor");
  expect(d.binding_constraint).toBe("thin-anchor");
  expect(d.ladder.firm).toBeNull();
});

test("quality_delta outside dispersion without override -> Monitor", () => {
  const d = scoreLot(bundle({ lot: { ...kayLot, quality_delta: 2.0 } }));
  expect(d.decision).toBe("Monitor");
  expect(d.binding_constraint).toBe("quality-delta-out-of-range");
});

test("quality_delta outside dispersion WITH override -> proceeds, flagged", () => {
  const d = scoreLot(bundle({ lot: { ...kayLot, quality_delta: 2.0, quality_override_reason: "exceptional fresh-to-market example" } }));
  expect(d.decision).toBe("Buy");
  expect(d.flags).toContain("quality-delta-override");
  expect(d.quality_delta.override).toBe("exceptional fresh-to-market example");
});

test("budget headroom below all-in halts (Monitor/budget)", () => {
  const d = scoreLot(bundle({ budget: { period_year: 2026, envelope_gbp: 5000, committed_gbp: 4000 } }));
  expect(d.decision).toBe("Monitor");
  expect(d.binding_constraint).toBe("budget");
});

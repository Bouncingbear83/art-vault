// Run: `bun test src/lib/desk/score.test.ts`
// The pure-formula assertions are exact and never drift. The live-slice numbers
// (fair £2,551 etc.) are a dated snapshot (Kay Exit_Strong in-zone 2023+, 2026-08);
// if comps move, update the fixture median, not the formula.
import { test, expect } from "bun:test";
import { scoreLot, type ScoreBundle, type CompRow, type DeskConfig, type DeskParams, type BandMedianRow } from "./score";

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
  // full ladder still shown: the lot qualifies, only funding blocks it
  expect(d.ladder.firm).toBe(1432);
  expect(d.ladder.stretch).toBe(1718);
  expect(d.all_in_at_firm).toBe(1913);
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

/* ---------------------- band-anchor regression guards ---------------------- */

const bandParams: DeskParams = { ...params, band_n_gate: 5, band_factor_cap: 2.0 };

// Shape of public.artist_size_band_medians (tier_scope='All_UK'), including the
// artist-level rollup row band_label='ALL' that bandFactor reads as denominator.
const bandCell = (
  band_label: string, band_lo: number, band_hi: number | null, sort_order: number, median_gbp: number,
): BandMedianRow => ({
  artist_id: "james-kay", band_label, band_lo, band_hi, sort_order, tier_scope: "All_UK",
  n: 10, median_gbp, p25_gbp: null, p75_gbp: null, min_gbp: null, max_gbp: null, thin: false,
});

// ALL = 3000 => <45 factor 1000/3000 = 0.333, 60-90 factor 4800/3000 = 1.6.
const kayBands: BandMedianRow[] = [
  bandCell("ALL", 0, null, 0, 3000),
  bandCell("<45", 0, 45, 1, 1000),
  bandCell("45-60", 45, 60, 2, 2400),
  bandCell("60-90", 60, 90, 3, 4800),
  bandCell("90+", 90, null, 4, 6000),
];

test("band anchor fires: 40cm vs 70cm fair values diverge by the band gradient", () => {
  const small = scoreLot(bundle({ lot: { ...kayLot, longest_cm: 40 }, params: bandParams, bands: kayBands }));
  const large = scoreLot(bundle({ lot: { ...kayLot, longest_cm: 70 }, params: bandParams, bands: kayBands }));

  expect(small.anchor.rung).toBe(2);
  expect(large.anchor.rung).toBe(2);
  expect(small.anchor.basis).toBe("band-scaled");
  expect(large.anchor.basis).toBe("band-scaled");
  expect(small.anchor.band_label).toBe("<45");
  expect(large.anchor.band_label).toBe("60-90");

  const ratio = (large.anchor.fair_value as number) / (small.anchor.fair_value as number);
  expect(ratio).toBeGreaterThan(4.5);
  expect(ratio).toBeLessThan(5.1);

  // cap is 2.0 here, so nothing should be clamped
  for (const d of [small, large]) {
    expect(d.anchor.flags.some((f) => f.startsWith("band-factor-clamped"))).toBe(false);
    expect(d.flags.some((f) => f.startsWith("band-factor-clamped"))).toBe(false);
  }
});

// The scorer once shipped with the band logic entirely missing while all ten
// existing tests passed, because none of them touched the anchor basis. A silent
// fallback to the artist-level median is the failure mode being guarded here.
test("absent bands degrade visibly to the artist basis", () => {
  const d = scoreLot(bundle({ lot: { ...kayLot, longest_cm: 40 }, params: bandParams, bands: [] }));
  expect(d.anchor.basis).toBe("artist");
  expect(d.anchor.fair_value).toBe(2551); // unscaled Exit_Strong tier median
  expect(d.flags).toContain("bands-not-supplied:artist-median-basis");
});

/* ------------------- paper sleeve: paper_primary is display-only ----------- */

// Wyld is the regression case. He is a live sub-sleeve name (ceiling £1,000) but
// carries paper_primary=false BY DESIGN so his grain page keeps the oil view.
// Gating eligibility on paper_primary made every finished Wyld sheet return
// "paper-not-eligible" and his ceiling unreachable. Eligibility is the ceiling.
const wyldCfg: DeskConfig = {
  artist_id: "william-wyld", discount_class: "quality_hold_wanted",
  discount_override_firm: null, discount_override_stretch: null, commission_floor_gbp: null,
  min_longest_cm: null, strong_venue_default: false,
  paper_primary: false,          // display flag, not an eligibility gate
  paper_ceiling_gbp: 1000, arr_active_until: null,
};

const wyldSheet = {
  artist_id: "william-wyld", title: "Venice, the Dogana", authorship: "Autograph",
  medium_raw: "watercolour heightened with bodycolour", medium_class: "Watercolour",
  longest_cm: 40, subject: "Venice", palette: "Sunlit", currency: "GBP",
  venue: "Christie's London", sale_date: "2026-09-01",
  strong_venue_candidate: false, taste_ok: true,
  sheet_grade: "Finished", condition_checked: true,
};

test("paper sleeve: paper_primary=false still reaches the ceiling (Wyld)", () => {
  const d = scoreLot(bundle({ lot: wyldSheet, config: wyldCfg, comps: [] }));
  expect(d.lane).toBe("paper");
  expect(d.binding_constraint).not.toBe("paper-not-eligible");
  expect(d.decision).toBe("Buy");
  // sighted finished sheet: firm = ceiling / K_buy, K = 1 + 0.28*1.20 = 1.336
  expect(d.ladder.firm).toBe(Math.round(1000 / 1.336));
});

test("paper sleeve: a watercolour for a name with no ceiling is a medium skip", () => {
  const noCeiling: DeskConfig = { ...wyldCfg, paper_ceiling_gbp: null };
  const d = scoreLot(bundle({ lot: wyldSheet, config: noCeiling, comps: [] }));
  expect(d.decision).toBe("Skip");
  expect(d.binding_constraint).toBe("medium");
  expect(d.ladder.firm).toBeNull();
});

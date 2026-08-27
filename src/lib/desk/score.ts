// ============================================================================
// Lot Desk v0.6 :: pure scorer (stages 1-13). No IO, no Supabase, no fetch.
// Given a lot + the artist's realised UK comps + config + params + budget,
// returns a Decision. Deterministic and unit-testable.
//
// Confirmed live tokens (2026-08, do not change without re-checking comps):
//   authorship  = 'Autograph'   (Attributed / Reproduction excluded)
//   medium_class = 'Oil' | 'Watercolour'
//   in_zone     = 'In' | 'Skip'
//   vtype_resolved UK tiers = 'Exit_Strong' | 'Straddle' | 'Buy_Regional'
// Home-market discipline is free: only UK tiers are passed in; Foreign/UNMAPPED
// never enter the anchor.
// ============================================================================

/* ------------------------------ constants ------------------------------ */

export const AUTOGRAPH = "Autograph";
export const OIL = "Oil";
export const WATERCOLOUR = "Watercolour";
export const IN = "In";
export const UK_TIERS = ["Exit_Strong", "Straddle", "Buy_Regional"] as const;
export type Tier = (typeof UK_TIERS)[number];
// Conservative preference: on a modal-tier tie, bias to the lower tier (anti-mirage).
const TIER_PREF: Tier[] = ["Buy_Regional", "Straddle", "Exit_Strong"];

// Taste zone (mirrors mandate §D vocab; keep in lockstep with the Sheet).
const ZONE_IN = new Set([
  "Venice", "Harbour/Marine", "Beach", "Market/Street", "River/City",
  "Brittany", "Lake/Como", "Nile/Egypt", "Ruins/Antiquity", "Floral/Still-life",
]);
const ZONE_SKIP = new Set(["Mountain/Alpine", "Townscape", "Pastoral", "Interior", "Other"]);
// Per-artist overrides, keyed by a token found in artist_id, then subject.
const ZONE_OVERRIDES: Array<{ token: string; subject: string; zone: "In" | "Skip" }> = [
  { token: "stokes", subject: "Mountain/Alpine", zone: "In" },
  { token: "east", subject: "Mountain/Alpine", zone: "In" },
  { token: "forbes", subject: "Pastoral", zone: "In" },
  { token: "olsson", subject: "River/City", zone: "Skip" },
  { token: "roberts", subject: "Interior", zone: "In" },
  { token: "brangwyn", subject: "Floral/Still-life", zone: "Skip" },
];

/* ------------------------------- types --------------------------------- */

export interface CompRow {
  hammer_equiv_gbp: number;
  in_zone: string | null;
  vtype_resolved: string | null;
  medium_class: string | null;
  longest_cm: number | null;
  sale_date: string | null;
}

export interface DeskConfig {
  artist_id: string;
  discount_class: string;
  discount_override_firm: number | null;
  discount_override_stretch: number | null;
  commission_floor_gbp: number | null;
  min_longest_cm: number | null;
  strong_venue_default: boolean;
  paper_primary: boolean;
  paper_ceiling_gbp: number | null;
  arr_active_until: string | null; // ISO date or null
}

export interface DeskParams {
  params_id: string;
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
  band_n_gate?: number;      // default 5; min n for a band cell to scale a bid
  band_factor_cap?: number;  // default 1.5; uplift cap. Downside uncapped by design
}

export interface BudgetRow {
  period_year: number;
  envelope_gbp: number;
  committed_gbp: number;
}

export interface LotInput {
  artist_id: string;
  artist_name?: string;
  title: string;
  authorship: string;
  medium_raw: string;
  medium_class?: string | null; // if omitted, inferred coarsely from medium_raw
  longest_cm: number;
  subject: string;
  palette: string; // Sunlit | Grey | Neutral | Moonlit
  palette_keyword_only?: boolean;
  in_zone?: "In" | "Skip"; // human may assert; else computed from subject+overrides
  est_low?: number | null;
  est_high?: number | null;
  currency: string;
  venue: string;
  sale_date: string; // ISO
  bp_pct?: number | null; // per-house; else params.bp_pct_default
  strong_venue_candidate: boolean;
  quality_delta?: number | null; // null => 1.0 + "median-quality assumed"
  quality_delta_basis?: string | null;
  quality_override_reason?: string | null;
  condition?: string | null;
  sheet_grade?: string | null; // paper sleeve: 'Finished' required
  condition_checked?: boolean;
  provenance_note?: string | null;
  sale_context?: string | null; // multiples / pair / budget-conflict prose
  taste_ok: boolean;
}

export interface Anchor {
  fair_value: number | null;
  tier: Tier | null;
  rung: number;
  n: number;
  confidence: "High" | "High-" | "Med" | "Med-" | null;
  iqr: [number, number] | null;
  comp_range: [number, number] | null;
  band_factor?: number | null;
  basis?: "band-scaled" | "artist";
  band_label?: string | null;
  band_n?: number | null;
  flags: string[];
}

/** One row of public.artist_size_band_medians (tier_scope='All_UK'). */
export interface BandMedianRow {
  artist_id: string;
  band_label: string;
  band_lo: number;
  band_hi: number | null;
  sort_order: number;
  tier_scope: string;
  n: number;
  median_gbp: number | null;
  p25_gbp: number | null;
  p75_gbp: number | null;
  min_gbp: number | null;
  max_gbp: number | null;
  thin: boolean;
}

export interface Ladder {
  firm: number | null;
  stretch: number | null;
  tightened: number | null;
  commission: number | null;
}

export interface Decision {
  lot: { artist_id: string; title: string; sale_key: string };
  decision: "Buy" | "Skip" | "Monitor";
  binding_constraint: string | null;
  lane: "oil" | "paper" | "pritchett-table";
  anchor: Anchor;
  quality_delta: { value: number; bound: [number, number] | null; basis: string; override: string | null };
  K_buy: number;
  ladder: Ladder;
  all_in_at_firm: number | null;
  taste_ok: boolean;
  budget_ok: boolean;
  params_id: string;
  flags: string[];
  rationale: string;
  vault: { note_body: string; valid_to: string; source_ref: string } | null;
}

export interface ScoreBundle {
  lot: LotInput;
  comps: CompRow[]; // artist's realised UK autograph oil+watercolour rows (hammer_equiv not null)
  config: DeskConfig;
  params: DeskParams;
  budget: BudgetRow | null;
  bands?: BandMedianRow[]
  today?: string; // ISO; defaults to now (injectable for tests)
}

/* ------------------------------ helpers -------------------------------- */

const round = (n: number) => Math.round(n);
const iso = (d?: string) => (d ?? new Date().toISOString().slice(0, 10));

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}
function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 1) return s[0] as number;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const vlo = s[lo] as number;
  const vhi = s[hi] as number;
  return lo === hi ? vlo : vlo + (vhi - vlo) * (pos - lo);
}

export function sizeBand(cm: number): { label: string; lo: number; hi: number } {
  if (cm < 45) return { label: "<45", lo: 0, hi: 45 };
  if (cm < 50) return { label: "45-50", lo: 45, hi: 50 };
  if (cm < 65) return { label: "50-65", lo: 50, hi: 65 };
  if (cm < 90) return { label: "65-90", lo: 65, hi: 90 };
  return { label: "90+", lo: 90, hi: Infinity };
}

/** Resolve the lot's band from the DB defs when supplied, else the code default. */
export function resolveBand(cm: number, bands?: BandMedianRow[]): { label: string; lo: number; hi: number } {
  if (bands && bands.length) {
    const hit = bands.find(
      (b) => b.tier_scope === "All_UK" && b.band_label !== "ALL" &&
             cm >= b.band_lo && (b.band_hi == null || cm < b.band_hi),
    );
    if (hit) return { label: hit.band_label, lo: hit.band_lo, hi: hit.band_hi ?? Infinity };
  }
  return sizeBand(cm);
}

interface BandFactor {
  factor: number;
  raw: number;
  clamped: boolean;
  n: number;
  bound: [number, number] | null;
}

/**
 * Size as a multiplicative factor on the tier median. Pooled All_UK basis:
 * per-tier size gradients are unmeasurable on this corpus (QA 2026-08-27), so
 * tier-independence of the gradient is an ASSUMPTION, stamped on the output.
 * Uplift is capped; the sub-1.0 half is uncapped because it only lowers a bid.
 */
function bandFactor(
  bands: BandMedianRow[] | undefined, artist_id: string, label: string,
  gate: number, cap: number,
): BandFactor | null {
  if (!bands?.length) return null;
  const cells = bands.filter((b) => b.artist_id === artist_id && b.tier_scope === "All_UK");
  const cell = cells.find((b) => b.band_label === label);
  if (!cell || cell.n < gate || cell.median_gbp == null) return null;

  const all = cells.filter((b) => b.median_gbp != null && b.n > 0);
  if (!all.length) return null;
  const totN = all.reduce((s, b) => s + b.n, 0);
  const artistLevel = all.reduce((s, b) => s + (b.median_gbp as number) * b.n, 0) / totN;
  if (!(artistLevel > 0)) return null;

  const raw = (cell.median_gbp as number) / artistLevel;
  const factor = raw > cap ? cap : raw;
  const bound: [number, number] | null =
    cell.min_gbp != null && cell.max_gbp != null
      ? [
          Math.round((cell.min_gbp / (cell.median_gbp as number)) * 100) / 100,
          Math.round((cell.max_gbp / (cell.median_gbp as number)) * 100) / 100,
        ]
      : null;
  return { factor, raw: Math.round(raw * 100) / 100, clamped: raw > cap, n: cell.n, bound };
}

export function computeInZone(artist_id: string, subject: string): "In" | "Skip" {
  const aid = artist_id.toLowerCase();
  for (const o of ZONE_OVERRIDES) if (aid.includes(o.token) && o.subject === subject) return o.zone;
  if (ZONE_IN.has(subject)) return "In";
  if (ZONE_SKIP.has(subject)) return "Skip";
  return "Skip"; // unknown subject defaults out
}

export function palettePref(artist_id: string): "Sunlit" | "Moonlit" {
  return artist_id.toLowerCase().includes("olsson") ? "Moonlit" : "Sunlit";
}

function inferMedium(raw: string): string {
  const r = raw.toLowerCase();
  if (/(oil|olio|huile)/.test(r)) return OIL;
  if (/(watercolour|watercolor|aquarelle|gouache|bodycolour)/.test(r)) return WATERCOLOUR;
  if (/(print|etching|lithograph)/.test(r)) return "Print";
  if (/(pastel|chalk)/.test(r)) return "Pastel";
  return "Mixed";
}

function arrLive(config: DeskConfig, today: string): boolean {
  return !!config.arr_active_until && today <= config.arr_active_until;
}

function kBuy(lot: LotInput, config: DeskConfig, params: DeskParams, today: string): number {
  const bp = lot.bp_pct ?? params.bp_pct_default;
  const arr = arrLive(config, today) ? params.arr_rate : 0;
  return 1 + bp * (1 + params.vat_premium) + arr;
}

function slugToken(id: string, token: string) {
  return id.toLowerCase().includes(token);
}

function saleKey(lot: LotInput): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return [lot.artist_id, norm(lot.title), norm(lot.venue), lot.sale_date].join("|");
}

/* --------------------------- rung ladder (§4) -------------------------- */

interface Slice {
  values: number[];
  rung: number;
  confidence: Anchor["confidence"];
  flags: string[];
}

function realisticTier(oilInZone: CompRow[]): Tier {
  const counts = new Map<Tier, number>();
  for (const c of oilInZone) {
    const t = c.vtype_resolved as Tier;
    if ((UK_TIERS as readonly string[]).includes(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best: Tier = "Buy_Regional";
  let bestN = -1;
  for (const t of TIER_PREF) {
    const n = counts.get(t) ?? 0;
    if (n > bestN) { bestN = n; best = t; }
  }
  return best;
}

function adjacentTiers(t: Tier): Tier[] {
  const order: Tier[] = ["Exit_Strong", "Straddle", "Buy_Regional"];
  const i = order.indexOf(t);
  return [order[i - 1], order[i + 1]].filter(Boolean) as Tier[];
}

/** Walk the rungs; return the first slice reaching n_gate, else rung 5 (empty). */
function findAnchorSlice(
  oil: CompRow[],
  tier: Tier,
  band: { lo: number; hi: number },
  params: DeskParams,
): Slice {
  const yr = (c: CompRow) => (c.sale_date ? Number(c.sale_date.slice(0, 4)) : 0);
  const recent = (c: CompRow) => yr(c) >= params.recency_cutoff;
  const inBand = (c: CompRow) => c.longest_cm != null && c.longest_cm >= band.lo && c.longest_cm < band.hi;
  const isTier = (c: CompRow, t: Tier) => c.vtype_resolved === t;
  const vals = (rows: CompRow[]) => rows.map((r) => r.hammer_equiv_gbp);

  // Rung 1: tier ∩ size-band ∩ 2023+
  const r1 = oil.filter((c) => isTier(c, tier) && inBand(c) && recent(c));
  if (r1.length >= params.n_gate) return { values: vals(r1), rung: 1, confidence: "High", flags: ["size-controlled"] };

  // Rung 2: tier ∩ 2023+
  const r2 = oil.filter((c) => isTier(c, tier) && recent(c));
  if (r2.length >= params.n_gate) return { values: vals(r2), rung: 2, confidence: "High-", flags: ["not-size-controlled"] };

  // Rung 3: tier ∩ all-time
  const r3 = oil.filter((c) => isTier(c, tier));
  if (r3.length >= params.n_gate) return { values: vals(r3), rung: 3, confidence: "Med", flags: ["stale", "regime-haircut-manual"] };

  // Rung 4: (tier + adjacent) ∩ 2023+, homogeneity-gated
  const tiers = [tier, ...adjacentTiers(tier)];
  const r4 = oil.filter((c) => tiers.includes(c.vtype_resolved as Tier) && recent(c));
  if (r4.length >= params.n_gate) {
    const subMedians = tiers
      .map((t) => r4.filter((c) => c.vtype_resolved === t).map((c) => c.hammer_equiv_gbp))
      .filter((a) => a.length > 0)
      .map((a) => median(a));
    const blendMed = median(vals(r4));
    const spread = (Math.max(...subMedians) - Math.min(...subMedians)) / blendMed;
    if (spread <= params.homogeneity_threshold) {
      return { values: vals(r4), rung: 4, confidence: "Med-", flags: ["tier-blended", "homogeneity-passed"] };
    }
    // homogeneity failed -> fall through to rung 5
  }
  return { values: [], rung: 5, confidence: null, flags: ["no-firm-anchor"] };
}

/* ------------------------------ scorer --------------------------------- */

export function scoreLot(b: ScoreBundle): Decision {
  const { lot, comps, config, params } = b;
  const today = iso(b.today);
  const flags: string[] = [];
  const sk = saleKey(lot);
  const K = kBuy(lot, config, params, today);

  const base = (over: Partial<Decision>): Decision => ({
    lot: { artist_id: lot.artist_id, title: lot.title, sale_key: sk },
    decision: "Skip",
    binding_constraint: null,
    lane: "oil",
    anchor: { fair_value: null, tier: null, rung: 5, n: 0, confidence: null, iqr: null, comp_range: null, flags: [] },
    quality_delta: { value: 1.0, bound: null, basis: "n/a", override: null },
    K_buy: round(K * 1000) / 1000,
    ladder: { firm: null, stretch: null, tightened: null, commission: config.commission_floor_gbp ?? null },
    all_in_at_firm: null,
    taste_ok: lot.taste_ok,
    budget_ok: false,
    params_id: params.params_id,
    flags,
    rationale: "",
    vault: null,
    ...over,
  });

  const medium = lot.medium_class ?? inferMedium(lot.medium_raw);
  const zone = lot.in_zone ?? computeInZone(lot.artist_id, lot.subject);

  // Stage 1: collision guard (surface only; cannot auto-resolve without birth year here)
  for (const t of ["stokes", "olsson", "walker"]) if (slugToken(lot.artist_id, t)) flags.push(`collision-guard:${t}`);
  if (/aspire|eldred/i.test(lot.venue)) flags.push("venue-collision-guard");

  // Stage 2: mandate gate
  if (lot.authorship !== AUTOGRAPH)
    return base({ decision: "Skip", binding_constraint: "authorship", rationale: `Not autograph (${lot.authorship}); excluded.` });

  const isPaper = medium === WATERCOLOUR;
  if (medium !== OIL && !(isPaper && config.paper_primary))
    return base({ decision: "Skip", binding_constraint: "medium", rationale: `${medium} outside oil mandate / paper sleeve.` });

  if (zone === "Skip")
    return base({ decision: "Skip", binding_constraint: "subject-zone", rationale: `${lot.subject} is out of taste zone for this name.` });

  // Stage 3: palette gate
  const pref = palettePref(lot.artist_id);
  const isOlsson = slugToken(lot.artist_id, "olsson");
  const stormException = isOlsson && lot.longest_cm >= 100;
  if (lot.palette === "Grey" && !stormException)
    return base({ decision: "Skip", binding_constraint: "palette", rationale: `Grey palette is Avoid${isOlsson ? " (Olsson Grey)" : ""}.` });
  if (stormException && lot.palette === "Grey") flags.push("storm-size-tier", "remote-haircut-applies");
  if (lot.palette !== pref) flags.push(`palette-not-preferred:${lot.palette}-vs-${pref}`);
  if (lot.palette_keyword_only) flags.push("palette-keyword-only");

  // Stage 4: size band + per-name size floor
  const band = resolveBand(lot.longest_cm, b.bands);
  if (config.min_longest_cm != null && lot.longest_cm < config.min_longest_cm)
    return base({ decision: "Skip", binding_constraint: "size-floor", rationale: `${lot.longest_cm}cm below ${config.min_longest_cm}cm floor for this name.` });

  // -------- Pritchett special: fixed size-tier table, not the ladder --------
  if (slugToken(lot.artist_id, "pritchett") && medium === OIL) {
    return scorePritchett(lot, config, params, K, today, sk, flags, band);
  }

  // -------- Paper sleeve lane --------
  if (isPaper) {
    return scorePaper(lot, config, params, K, sk, flags, zone);
  }

  // -------- Oil lane: rung ladder --------
  const oil = comps.filter((c) => c.medium_class === OIL && c.in_zone === IN);
  const tier: Tier = lot.strong_venue_candidate ? "Exit_Strong" : realisticTier(oil);
  if (lot.strong_venue_candidate) flags.push("strong_venue_candidate");
  const slice = findAnchorSlice(oil, tier, band, params);

  if (slice.rung === 5) {
    // No firm anchor -> commission floor / WATCH
    const floor = config.commission_floor_gbp ?? null;
    return base({
      decision: "Monitor",
      lane: "oil",
      binding_constraint: "thin-anchor",
      anchor: { fair_value: null, tier, rung: 5, n: 0, confidence: null, iqr: null, comp_range: null, flags: slice.flags },
      ladder: { firm: null, stretch: null, tightened: null, commission: floor },
      budget_ok: false,
      flags,
      rationale: floor
        ? `Thin anchor (n<${params.n_gate}); standing commission at £${floor} only, low confidence.`
        : `Thin anchor (n<${params.n_gate}); WATCH, no defensible number.`,
    });
  }

  const tierMed = round(median(slice.values));
  const anchorFlags = [...slice.flags];

  // Size scaling. Rung 1 is already tier ∩ band, so scaling it would double-count.
  if (!b.bands?.length) flags.push("bands-not-supplied:artist-median-basis");
  const bf = slice.rung === 1
    ? null
    : bandFactor(b.bands, lot.artist_id, band.label,
                 params.band_n_gate ?? 5, params.band_factor_cap ?? 1.5);

  const fair_value = bf ? round(tierMed * bf.factor) : tierMed;

  if (slice.rung === 1) {
    anchorFlags.push(`band-native:${band.label}`);
  } else if (bf) {
    anchorFlags.push(
      `band-scaled:${band.label}`, `band-factor:${bf.raw}`, "tier-gradient-assumed",
      ...(bf.clamped ? [`band-factor-clamped:${bf.raw}->${bf.factor}`] : []),
    );
  } else {
    anchorFlags.push(`band-thin-fallback:${band.label}`);
  }

  // Dispersion: within-band when scaled, so size does not re-enter quality_delta.
  const vals = slice.values;
  const lo = bf && bf.bound ? round(bf.bound[0] * fair_value) : round(Math.min(...vals));
  const hi = bf && bf.bound ? round(bf.bound[1] * fair_value) : round(Math.max(...vals));

  const anchor: Anchor = {
    fair_value, tier, rung: slice.rung, n: slice.values.length,
    confidence: bf && bf.clamped ? "Med" : slice.confidence,
    iqr: [round(quantile(vals, 0.25)), round(quantile(vals, 0.75))],
    comp_range: [lo, hi],
    basis: bf ? "band-scaled" : "artist",
    band_label: band.label, band_factor: bf ? bf.factor : null, band_n: bf ? bf.n : null,
    flags: anchorFlags,
  };

  // Stage 6: quality delta (bounded)
  const bound: [number, number] = [
    Math.round((lo / fair_value) * 100) / 100,
    Math.round((hi / fair_value) * 100) / 100,
  ];
  let qd = lot.quality_delta ?? 1.0;
  let qdBasis = lot.quality_delta_basis ?? (lot.quality_delta == null ? "median-quality assumed" : "asserted");
  let qdOverride: string | null = null;
  if (lot.quality_delta == null) flags.push("median-quality-assumed");
  const outOfRange = qd < bound[0] || qd > bound[1];
  if (outOfRange) {
    if (lot.quality_override_reason) {
      qdOverride = lot.quality_override_reason;
      flags.push("quality-delta-override");
    } else {
      // refuse out-of-range without override: soft halt, no firm number
      return base({
        decision: "Monitor",
        lane: "oil",
        binding_constraint: "quality-delta-out-of-range",
        anchor,
        quality_delta: { value: qd, bound, basis: qdBasis, override: null },
        ladder: { firm: null, stretch: null, tightened: null, commission: config.commission_floor_gbp ?? null },
        flags,
        rationale: `quality_delta ${qd} outside observed dispersion [${bound[0]}, ${bound[1]}]; supply an override reason or bring it in range.`,
      });
    }
  }

  // Stage 6/10: discounts + ladder
  const dFirm = config.discount_override_firm ?? params.collector_discount_firm;
  const dStretch = config.discount_override_stretch ?? params.collector_discount_stretch;
  const H = (d: number, fv: number) => round((fv * qd * (1 - d)) / K);
  const staleRung = slice.rung >= 3;
  const fvForBid = staleRung ? fair_value * (1 - params.stale_haircut) : fair_value;
  if (staleRung) flags.push("stale-haircut-applied");

  const firm = H(dFirm, fvForBid);
  const stretch = staleRung ? null : H(dStretch, fair_value);
  const tightened = staleRung ? H(dFirm, fvForBid) : null;
  const all_in_at_firm = round(firm * K);

  // Stage 8: taste gate (hard)
  if (!lot.taste_ok) {
    return base({
      decision: "Skip", lane: "oil", binding_constraint: "taste-gate", anchor,
      quality_delta: { value: qd, bound, basis: qdBasis, override: qdOverride },
      ladder: { firm: null, stretch: null, tightened: null, commission: config.commission_floor_gbp ?? null },
      flags, rationale: "Taste gate N: would not be glad to own; no ladder.",
    });
  }

  // Stage 9: budget gate (hard)
  const envelope = b.budget?.envelope_gbp ?? 0;
  const committed = b.budget?.committed_gbp ?? 0;
  const remaining = envelope - committed;
  const budget_ok = envelope > 0 && remaining >= all_in_at_firm;
  if (!budget_ok) {
    return base({
      decision: "Monitor", lane: "oil",
      binding_constraint: envelope <= 0 ? "no-envelope" : "budget",
      anchor, quality_delta: { value: qd, bound, basis: qdBasis, override: qdOverride },
      K_buy: round(K * 1000) / 1000,
      // Full ladder shown: the lot qualifies; the constraint is funding, not price.
      ladder: { firm, stretch, tightened, commission: config.commission_floor_gbp ?? null },
      all_in_at_firm, budget_ok: false, flags,
      rationale: envelope <= 0
        ? `No budget envelope set: bidding blocked by design (would bid firm £${firm}).`
        : `Budget headroom £${round(remaining)} < prospective all-in £${all_in_at_firm}; no bid (would bid firm £${firm}).`,
    });
  }

  // Stage 11: reconcile vs commission floor
  const floor = config.commission_floor_gbp ?? null;
  if (floor != null && floor > firm) flags.push(`floor-above-firm:${floor}>${firm}`);

  // Stage 12: second-order flags
  addSecondOrderFlags(lot, flags);

  // Stage 13: output
  const rationale =
    `${anchor.confidence} anchor (rung ${slice.rung}, n=${anchor.n}, ${tier}` +
    `${anchor.band_factor ? `, ${band.label} ×${anchor.band_factor}` : ""}); fair £${fair_value}, ` +
    `δ ${qd}${qdOverride ? " (override)" : ""}; firm £${firm}${stretch ? `, stretch £${stretch}` : ""} ` +
    `(all-in £${all_in_at_firm}); glad-to-own at a fair price.`;

  return {
    lot: { artist_id: lot.artist_id, title: lot.title, sale_key: sk },
    decision: "Buy",
    binding_constraint: null,
    lane: "oil",
    anchor,
    quality_delta: { value: qd, bound, basis: qdBasis, override: qdOverride },
    K_buy: round(K * 1000) / 1000,
    ladder: { firm, stretch, tightened, commission: floor },
    all_in_at_firm,
    taste_ok: true,
    budget_ok: true,
    params_id: params.params_id,
    flags,
    rationale,
    vault: buildVault(lot, sk, "Buy", anchor, qd, firm, stretch, all_in_at_firm, flags),
  };
}

/* ------------------------- Pritchett special --------------------------- */

function scorePritchett(
  lot: LotInput, config: DeskConfig, params: DeskParams, K: number, today: string,
  sk: string, flags: string[], band: { label: string },
): Decision {
  // All-in glad-to-own ceilings; hammer = ceiling / K_buy.
  let allInCeiling: number | null = null;
  if (lot.longest_cm >= 65) allInCeiling = 5500;
  else if (lot.longest_cm >= 50) allInCeiling = 4000;
  else if (lot.longest_cm >= 45) allInCeiling = 2750;
  flags.push("pritchett-size-tier-table", "dates-low-confidence");
  const firm = allInCeiling != null ? Math.round(allInCeiling / K) : null;
  const decision: Decision["decision"] = !lot.taste_ok ? "Skip" : firm != null ? "Buy" : "Skip";
  const rationale = firm != null
    ? `Pritchett size-tier (${band.label}): all-in ceiling £${allInCeiling}, firm hammer £${firm}. Signed oil only.`
    : "Below 45cm: skip.";
  return {
    lot: { artist_id: lot.artist_id, title: lot.title, sale_key: sk },
    decision, binding_constraint: !lot.taste_ok ? "taste-gate" : firm == null ? "size-floor" : null,
    lane: "pritchett-table",
    anchor: { fair_value: allInCeiling, tier: null, rung: 0, n: 0, confidence: null, iqr: null, comp_range: null, flags: ["fixed-tier-table"] },
    quality_delta: { value: 1.0, bound: null, basis: "n/a (fixed table)", override: null },
    K_buy: Math.round(K * 1000) / 1000,
    ladder: { firm, stretch: null, tightened: null, commission: config.commission_floor_gbp ?? null },
    all_in_at_firm: allInCeiling,
    taste_ok: lot.taste_ok, budget_ok: false, params_id: params.params_id, flags,
    rationale,
    vault: firm != null && lot.taste_ok ? buildVault(lot, sk, "Buy", null, 1.0, firm, null, allInCeiling, flags) : null,
  };
}

/* ---------------------------- Paper sleeve ----------------------------- */

function scorePaper(
  lot: LotInput, config: DeskConfig, params: DeskParams, K: number,
  sk: string, flags: string[], zone: "In" | "Skip",
): Decision {
  const ceiling = config.paper_ceiling_gbp;
  flags.push("paper-sleeve");
  const finished = (lot.sheet_grade ?? "").toLowerCase() === "finished";
  const sighted = lot.condition_checked === true;
  let binding: string | null = null;
  let firm: number | null = null;
  let rationale = "";

  if (!config.paper_primary || ceiling == null) { binding = "paper-not-eligible"; rationale = "Not a paper-sleeve name."; }
  else if (!finished) { binding = "sheet-grade"; rationale = "Paper sleeve requires a Finished sheet."; }
  else if (zone === "Skip") { binding = "subject-zone"; rationale = "Out of zone."; }
  else if (!sighted && ceiling > 1500) { binding = "condition-report"; rationale = `Unsighted paper with ceiling £${ceiling} (> £1,500) needs a report before any bid.`; }
  else {
    firm = sighted ? Math.round(ceiling / K) : Math.round((ceiling * (1 - params.remote_haircut)) / K);
    if (!sighted) flags.push("remote-haircut-applied");
    rationale = `Finished sheet; walk-away £${firm} hammer (${sighted ? "sighted" : "blind punt, haircut"}), ceiling £${ceiling}.`;
  }

  const decision: Decision["decision"] = firm != null && lot.taste_ok ? "Buy" : firm != null ? "Skip" : "Monitor";
  if (firm != null && !lot.taste_ok) binding = "taste-gate";
  return {
    lot: { artist_id: lot.artist_id, title: lot.title, sale_key: sk },
    decision, binding_constraint: binding, lane: "paper",
    anchor: { fair_value: ceiling, tier: null, rung: 0, n: 0, confidence: null, iqr: null, comp_range: null, flags: ["paper-ceiling"] },
    quality_delta: { value: 1.0, bound: null, basis: "n/a (paper ceiling)", override: null },
    K_buy: Math.round(K * 1000) / 1000,
    ladder: { firm, stretch: null, tightened: null, commission: config.commission_floor_gbp ?? null },
    all_in_at_firm: firm != null ? Math.round(firm * K) : null,
    taste_ok: lot.taste_ok, budget_ok: false, params_id: params.params_id, flags, rationale,
    vault: firm != null && lot.taste_ok ? buildVault(lot, sk, "Buy", null, 1.0, firm, null, firm != null ? Math.round(firm * K) : null, flags) : null,
  };
}

/* ------------------------- shared tail helpers ------------------------- */

function addSecondOrderFlags(lot: LotInput, flags: string[]) {
  const ctx = (lot.sale_context ?? "").toLowerCase();
  if (/multiple|second lot|two lots|same sale/.test(ctx)) flags.push("multiples-in-sale:bid-later-lot");
  if (/pair/.test(ctx)) flags.push("pair:mid-to-high-estimate");
  if (lot.provenance_note && /short|recent|flip|re-consign|bought 20/.test(lot.provenance_note.toLowerCase()))
    flags.push("provenance-flip:push-lower");
  const cond = (lot.condition ?? "").toLowerCase();
  if (/reline|panel|board|craquelure|overpaint|loss|tear/.test(cond)) flags.push("condition-risk:scrutinise");
}

function buildVault(
  lot: LotInput, sk: string, decision: string, anchor: Anchor | null,
  qd: number, firm: number | null, stretch: number | null, allIn: number | null, flags: string[],
): { note_body: string; valid_to: string } & { source_ref: string } {
  const grain = anchor
    ? `GRAIN: rung ${anchor.rung}, n=${anchor.n}, ${anchor.tier}, fair £${anchor.fair_value} (IQR ${anchor.iqr?.[0]}-${anchor.iqr?.[1]}).`
    : `GRAIN: fixed lane (${lot.medium_class ?? "oil"}), no rung anchor.`;
  const finding = `FINDING: δ ${qd}; firm £${firm ?? "-"}${stretch ? `, stretch £${stretch}` : ""}; all-in £${allIn ?? "-"}.`;
  const read = `READ: ${decision}. ${lot.title} at ${lot.venue}, ${lot.sale_date}.`;
  const guards = `GUARDS: home-market anchor; K_buy per-name; ${lot.strong_venue_candidate ? "strong-venue asserted" : "realistic-tier default"}.`;
  const flagLine = `FLAGS: ${flags.length ? flags.join("; ") : "none"}.`;
  const validTo = new Date(new Date(lot.sale_date).getTime() + 86400000).toISOString().slice(0, 10);
  return { note_body: [grain, finding, read, guards, flagLine].join("\n\n"), valid_to: validTo, source_ref: sk };
}

// §F watercolour sub-sleeve resolution.
//
// AUTHORITY, in order:
//   1. artist_desk_config.paper_ceiling_gbp / .paper_primary  <- the live values
//   2. the FALLBACK table below                               <- offline only
//
// Mandate v7.3 made ceilings COMPUTED, not fixed: `desk_params
// .sleeve_ceiling_multiple` (0.45 ratified) x each name's
// `inzone_finished_wc_median_gbp`, written to artist_desk_config by the
// `apply_sleeve_multiple` RPC and driven by the /desk/params slider. A
// hardcoded client constant therefore goes stale the moment the slider moves,
// which is the three-way ceiling drift (code / Sheet / DB) that v7.3 retired.
// Read the DB and pass it in; the table below exists only so a component still
// renders something sane before the config query resolves.
//
// `paperPrimary` is a DISPLAY flag, never an eligibility gate: it decides
// whether the grain page suppresses the oil view. Wyld carries it false by
// design because his oils are the liked pictures, while still holding a live
// £1,000 ceiling. Sleeve membership is the CEILING (see score.ts, both gates).

export interface PaperSleeveEntry {
  ceiling: number; // Paper_Ceiling_GBP, hammer-equiv
  paperPrimary: boolean;
}

/**
 * FALLBACK ONLY. Correct as at 2026-08-26 (multiple 0.45). Do not read these in
 * new code and do not "fix" them by hand if they disagree with the app: fix the
 * multiple or the in-zone median and let the RPC rewrite artist_desk_config.
 */
export const PAPER_SLEEVE_FALLBACK: Record<string, PaperSleeveEntry> = {
  "william-wyld": { ceiling: 1000, paperPrimary: false },
  "david-roberts": { ceiling: 4200, paperPrimary: true },
  "arthur-melville": { ceiling: 3750, paperPrimary: true },
};

/** Live config shape, as read from artist_desk_config. */
export interface SleeveConfig {
  paper_ceiling_gbp: number | null;
  paper_primary: boolean | null;
}

/**
 * Resolve a name's sleeve entry. Pass the config row when you have it; omit it
 * only where no query is possible, and accept that the answer may be stale.
 */
export function resolveSleeve(
  artistId?: string | null,
  config?: SleeveConfig | null,
): (PaperSleeveEntry & { stale: boolean }) | null {
  if (!artistId) return null;
  if (config && config.paper_ceiling_gbp != null) {
    return {
      ceiling: Number(config.paper_ceiling_gbp),
      paperPrimary: config.paper_primary === true,
      stale: false,
    };
  }
  // an explicit config row with a null ceiling is a definitive "not in the
  // sleeve"; only an ABSENT config row falls through to the fallback table.
  if (config) return null;
  const fb = PAPER_SLEEVE_FALLBACK[artistId];
  return fb ? { ...fb, stale: true } : null;
}

/** @deprecated fallback-only lookup; prefer resolveSleeve with a config row. */
export const paperSleeve = (artistId?: string | null): PaperSleeveEntry | null =>
  artistId ? (PAPER_SLEEVE_FALLBACK[artistId] ?? null) : null;

/** Display gate: does the grain page suppress the oil view for this name? */
export const isPaperPrimary = (
  artistId?: string | null,
  config?: SleeveConfig | null,
): boolean => resolveSleeve(artistId, config)?.paperPrimary === true;

/** @deprecated fallback-only; prefer isPaperPrimary with a config row. */
export const isPaperSleeve = (artistId?: string | null): boolean =>
  paperSleeve(artistId)?.paperPrimary === true;

/** Ceiling for any sleeve entry, primary or not (Lot Desk paper-bid gate). */
export const paperCeiling = (
  artistId?: string | null,
  config?: SleeveConfig | null,
): number | null => resolveSleeve(artistId, config)?.ceiling ?? null;

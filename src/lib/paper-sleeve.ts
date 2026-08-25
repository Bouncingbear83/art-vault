// Single source of truth for the §F watercolour sub-sleeve.
// Values mirror the Mediums tab (Paper_Primary Y/N, Paper_Ceiling_GBP), which
// is the authoritative source. Until artist_desk_config / a mediums mirror is
// exposed to the client, they live here; keep in lockstep with the sheet.
//
// paperPrimary distinguishes two cases:
//  - true  (Roberts, Melville): watercolour IS the thesis. The grain page
//    suppresses the oil Exit/Regional view and shows the ceiling bar instead.
//  - false (Wyld): oil-primary name that also carries a paper ceiling. His oil
//    view stays intact; the ceiling is captured for the Lot Desk paper-bid gate
//    but does not take over the grain page.

export interface PaperSleeveEntry {
  ceiling: number; // Paper_Ceiling_GBP, hammer-equiv
  paperPrimary: boolean;
}

export const PAPER_SLEEVE: Record<string, PaperSleeveEntry> = {
  "david-roberts": { ceiling: 3750, paperPrimary: true },
  "arthur-melville": { ceiling: 3000, paperPrimary: true },
  "william-wyld": { ceiling: 1000, paperPrimary: false },
};

export const paperSleeve = (artistId?: string | null): PaperSleeveEntry | null =>
  artistId ? (PAPER_SLEEVE[artistId] ?? null) : null;

// paper-PRIMARY only (drives oil-view suppression + the Book "oil median" chip).
// Wyld is deliberately excluded: his oil median is his real thesis.
export const isPaperSleeve = (artistId?: string | null): boolean =>
  paperSleeve(artistId)?.paperPrimary === true;

// ceiling for any sleeve entry, primary or not (Lot Desk paper-bid gate).
export const paperCeiling = (artistId?: string | null): number | null =>
  paperSleeve(artistId)?.ceiling ?? null;

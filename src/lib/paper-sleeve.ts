// Single source of truth for the §F watercolour sub-sleeve.
// Mirrors the Mediums tab (Paper_Primary Y/N, Paper_Ceiling_GBP) until
// artist_desk_config exposes those fields to the client. Closed set per
// Mandate §F: Roberts and Melville only. Any consumer that needs to know a
// name is paper-primary (grain panels, the Book, future radar) imports from
// HERE, so the list never drifts across files.

export interface PaperSleeveEntry {
  ceiling: number; // Paper_Ceiling_GBP, hammer-equiv
}

export const PAPER_SLEEVE: Record<string, PaperSleeveEntry> = {
  "david-roberts": { ceiling: 3000 },
  "arthur-melville": { ceiling: 3750 },
};

export const paperSleeve = (artistId?: string | null): PaperSleeveEntry | null =>
  artistId ? (PAPER_SLEEVE[artistId] ?? null) : null;

export const isPaperSleeve = (artistId?: string | null): boolean =>
  paperSleeve(artistId) !== null;

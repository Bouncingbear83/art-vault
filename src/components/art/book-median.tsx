import { Link } from "@tanstack/react-router";
import { Chip } from "@/components/art/primitives";
import { gbp } from "@/lib/art360";
import { isPaperSleeve } from "@/lib/paper-sleeve";

// Book MEDIAN UK cell.
//
// comps_rollup.median_uk_hammer_gbp is an AUTOGRAPH-OIL median. For an oil name
// that is the governing number. For a paper-sleeve name (Roberts, Melville) it
// is NOT the thesis: their edge lives on finished sheets, an order of magnitude
// below the oil figure (Roberts: oil ~£10.8k vs paper ~£1.5k). The oil number
// is correct but must not masquerade as the bid anchor, so here we keep it
// visible, demote it, label it "oil median", and route to the grain page where
// the ceiling-relative paper read lives.
//
// No data-layer change: this is purely how the existing rollup field is shown.
// If you later add a watercolour median to comps_rollup, swap the muted figure
// for the paper median and this becomes exact rather than a redirect.

export function BookMedian({
  artistId,
  medianGbp,
}: {
  artistId: string;
  medianGbp: number | null | undefined;
}) {
  if (!isPaperSleeve(artistId)) {
    return <span className="num">{gbp(medianGbp)}</span>;
  }
  return (
    <span className="num inline-flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground">{gbp(medianGbp)}</span>
      <Link
        to="/grain/$artist"
        params={{ artist: artistId }}
        className="shrink-0"
        title="Paper-sleeve name: this is the oil median, not the paper thesis. Open the grain page for the ceiling-relative read."
      >
        <Chip tone="ochre">oil median · grain</Chip>
      </Link>
    </span>
  );
}

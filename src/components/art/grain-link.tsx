import { Link } from "@tanstack/react-router";

// One canonical link to the per-name grain diagnostics page. Dropped into the
// Book row, the Artist 360 file, and the Lot Desk so the entry point is
// consistent and lives in one place. Note the grain route's param is `artist`,
// not `artistId`.
export function GrainLink({
  artistId,
  className,
  label = "Grain diagnostics",
}: {
  artistId: string;
  className?: string;
  label?: string;
}) {
  return (
    <Link
      to="/grain/$artist"
      params={{ artist: artistId }}
      className={className ?? "label-caps hover:text-foreground"}
    >
      {label} ›
    </Link>
  );
}

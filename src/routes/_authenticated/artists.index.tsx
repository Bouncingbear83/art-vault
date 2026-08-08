import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/art/app-shell";
import { Chip, EmptyState, PaletteSwatch } from "@/components/art/primitives";
import { fetchArtist360, gbp, pct, type Artist360 } from "@/lib/art360";

export const Route = createFileRoute("/_authenticated/artists/")({
  head: () => ({
    meta: [
      { title: "Artist 360 — Art360" },
      {
        name: "description",
        content: "Wall-label cards for every artist on the book, with UK auction quant and open flags.",
      },
      { property: "og:title", content: "Artist 360 — Art360" },
      { property: "og:description", content: "Artist cards with UK auction quant and open flags." },
    ],
  }),
  component: ArtistGrid,
});

function ArtistGrid() {
  const { data, isLoading, error } = useQuery({ queryKey: ["artist-360"], queryFn: fetchArtist360 });
  const artists = data ?? [];

  return (
    <AppShell
      eyebrow="Catalogue"
      title="Artist 360"
      lede="Each card is a wall label: identity above, the quant strip below, flags owed on the right."
    >
      {isLoading && <p className="label-caps">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {!isLoading && artists.length === 0 && <EmptyState title="No artists catalogued yet" />}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {artists.map((a) => (
          <ArtistCard key={a.artist_id} artist={a} />
        ))}
      </div>
    </AppShell>
  );
}

function ArtistCard({ artist }: { artist: Artist360 }) {
  const thin = (artist.n_uk_auto_oil ?? 0) < 8;
  return (
    <Link
      to="/artists/$artistId"
      params={{ artistId: artist.artist_id as string }}
      className="wall-card group flex flex-col p-5 transition-colors hover:border-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl leading-tight text-foreground">{artist.display_name}</h2>
          <p className="num mt-1 text-xs text-muted-foreground">{artist.dates ?? "—"}</p>
        </div>
        {(artist.open_flags ?? 0) > 0 && (
          <span className="num inline-flex shrink-0 items-center gap-1.5 text-xs text-primary">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" />
            {artist.open_flags}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {artist.play_type && <Chip>{artist.play_type}</Chip>}
        <PaletteSwatch palette={artist.palette_pref} />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4">
        <div>
          <p className="label-caps">Med UK</p>
          <p className="num mt-1 text-sm">{gbp(artist.median_uk_hammer_gbp)}</p>
        </div>
        <div>
          <p className="label-caps">Sell-thru</p>
          <p className="num mt-1 text-sm text-harbour">{pct(artist.sell_through_pct)}</p>
        </div>
        <div>
          <p className="label-caps">n oils</p>
          <p className={`num mt-1 text-sm ${thin ? "text-primary" : ""}`}>
            {artist.n_uk_auto_oil ?? "—"}
          </p>
        </div>
      </div>
    </Link>
  );
}

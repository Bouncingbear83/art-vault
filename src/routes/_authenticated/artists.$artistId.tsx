import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/art/app-shell";
import { Chip, EmptyState, PaletteSwatch, Stat } from "@/components/art/primitives";
import { NoteCard } from "@/components/art/note-card";
import {
  fetchArtistById,
  fetchArtistNotes,
  formatDate,
  gbp,
  isExpired,
  pct,
  type NoteWithRelations,
} from "@/lib/art360";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/artists/$artistId")({
  head: () => ({
    meta: [
      { title: "Artist file — Art360" },
      { name: "description", content: "Wall-label header, quant strip and the full note record." },
      { property: "og:title", content: "Artist file — Art360" },
      { property: "og:description", content: "Quant strip and the full judgement record." },
    ],
  }),
  component: ArtistPage,
});

const TABS = ["Verdict", "Triggers", "Flags", "All notes", "History"] as const;
type Tab = (typeof TABS)[number];

function ArtistPage() {
  const { artistId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("Verdict");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  const { data: artist, isLoading } = useQuery({
    queryKey: ["artist", artistId],
    queryFn: () => fetchArtistById(artistId),
  });
  const { data: notes } = useQuery({
    queryKey: ["artist-notes", artistId],
    queryFn: () => fetchArtistNotes(artistId),
  });

  if (isLoading) {
    return (
      <AppShell>
        <p className="label-caps">Loading…</p>
      </AppShell>
    );
  }
  if (!artist) {
    return (
      <AppShell>
        <EmptyState title="Artist not found" />
      </AppShell>
    );
  }

  const all = notes ?? [];
  const current = (n: NoteWithRelations) => !isExpired(n.valid_to);
  const thin = (artist.n_uk_auto_oil ?? 0) < 8;

  let shown: NoteWithRelations[] = [];
  if (tab === "Verdict") {
    shown = all.filter((n) => n.note_type === "Verdict" && current(n)).slice(0, 1);
  } else if (tab === "Triggers") {
    shown = all.filter((n) => n.note_type === "Trigger");
  } else if (tab === "Flags") {
    shown = all.filter((n) => n.note_type === "Flag" && n.action_status === "Open");
  } else if (tab === "History") {
    shown = all.filter((n) => n.supersedes !== null || all.some((o) => o.supersedes === n.id));
  } else {
    shown = all.filter(
      (n) =>
        (!typeFilter || n.note_type === typeFilter) &&
        (!statusFilter || n.action_status === statusFilter) &&
        (!tagFilter || n.note_tags?.some((t) => t.tag === tagFilter)),
    );
  }

  const allTags = Array.from(new Set(all.flatMap((n) => n.note_tags?.map((t) => t.tag) ?? [])));
  const selectClass =
    "rounded-sm border border-input bg-card px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary";

  return (
    <AppShell>
      <Link to="/artists" className="label-caps hover:text-foreground">
        ← Catalogue
      </Link>

      {/* tombstone wall label */}
      <header className="mt-4 border-b border-border pb-7">
        <h1 className="font-display text-4xl leading-none text-foreground sm:text-5xl">
          {artist.name}
        </h1>
        <p className="num mt-2 text-sm text-muted-foreground">
          {artist.dates_text ?? "—"}
          {artist.nationality ? ` · ${artist.nationality}` : ""}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip tone="ochre">{artist.tier}</Chip>
          <Chip tone="muted">{artist.arr_status}</Chip>
          {artist.play_type && <Chip>{artist.play_type}</Chip>}
          <PaletteSwatch palette={artist.palette_pref} />
        </div>
      </header>

      {/* quant strip */}
      <section className="wall-card mt-6 grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-4 lg:grid-cols-5">
        <Stat label="Median UK hammer" value={gbp(artist.median_uk_hammer_gbp)} />
        <Stat label="Mean UK hammer" value={gbp(artist.mean_uk_hammer_gbp)} />
        <Stat label="Low" value={gbp(artist.low_gbp)} />
        <Stat label="High" value={gbp(artist.high_gbp)} />
        <Stat label="Sell-through" value={pct(artist.sell_through_pct)} tone="harbour" />
        <Stat
          label="n UK auto oil"
          value={artist.n_uk_auto_oil ?? "—"}
          tone={thin ? "ochre" : "default"}
        />
        <Stat label="n lots total" value={artist.n_lots_total ?? "—"} />
        <Stat label="Last sale" value={formatDate(artist.last_sale_date)} />
        <Stat label="Open flags" value={artist.open_flags ?? 0} tone="ochre" />
        <div>
          <p className="label-caps">Data confidence</p>
          <div className="mt-1">
            <Chip tone={artist.data_confidence === "Thin" ? "ochre" : "harbour"}>
              {artist.data_confidence ?? "—"}
            </Chip>
          </div>
        </div>
      </section>
      {thin && (
        <p className="mt-3 text-xs text-primary">
          Thin sample: fewer than 8 UK oils at auction. Treat the medians as indicative only.
        </p>
      )}

      {/* tabs */}
      <nav className="mt-9 flex flex-wrap gap-x-6 gap-y-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "label-caps -mb-px border-b-2 pb-3 transition-colors",
              tab === t ? "border-primary text-foreground" : "border-transparent",
            )}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "All notes" && (
        <div className="mt-5 flex flex-wrap gap-3">
          <select
            className={selectClass}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All types</option>
            {["Verdict", "Trigger", "Flag", "Observation"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            className={selectClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Any status</option>
            {["Open", "Actioned", "Dismissed"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            className={selectClass}
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="">Any tag</option>
            {allTags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {shown.length === 0 ? (
          <EmptyState
            title="Nothing recorded here"
            hint="Capture a note to start the record for this artist."
          />
        ) : (
          shown.map((n) => <NoteCard key={n.id} note={n} />)
        )}
      </div>
    </AppShell>
  );
}

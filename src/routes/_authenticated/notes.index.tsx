import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/art/app-shell";
import { EmptyState } from "@/components/art/primitives";
import { NoteCard } from "@/components/art/note-card";
import { fetchNotesByTag, fetchTagCounts } from "@/lib/art360";
import { cn } from "@/lib/utils";

type Search = { tag?: string };

export const Route = createFileRoute("/_authenticated/notes/")({
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search['tag'] === "string" ? { tag: search['tag'] } : {},
  head: () => ({
    meta: [
      { title: "Notes by tag — Art360" },
      {
        name: "description",
        content: "Browse every verdict, trigger and flag by controlled tag, across the whole book.",
      },
      { property: "og:title", content: "Notes by tag — Art360" },
      { property: "og:description", content: "Every note carrying a controlled tag, book-wide." },
    ],
  }),
  component: NotesByTag,
});

function NotesByTag() {
  const { tag } = Route.useSearch();

  const { data: tags } = useQuery({ queryKey: ["tag-counts"], queryFn: fetchTagCounts });
  const { data: notes, isLoading } = useQuery({
    queryKey: ["notes-by-tag", tag],
    queryFn: () => fetchNotesByTag(tag!),
    enabled: !!tag,
  });

  return (
    <AppShell
      eyebrow="Catalogue"
      title="Notes by tag"
      lede="Every note carrying a controlled tag, across all names. Pick a tag to filter; click it again to clear."
    >
      <div className="mb-6 flex flex-wrap gap-2">
        {(tags ?? []).map((t) => {
          const active = t.tag === tag;
          return (
            <Link
              key={t.tag}
              to="/notes"
              search={active ? {} : { tag: t.tag }}
              title={t.description ?? undefined}
              className={cn(
                "label-caps inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
                t.count === 0 && "opacity-40",
              )}
            >
              {t.tag}
              <span className="num text-[11px]">{t.count}</span>
            </Link>
          );
        })}
      </div>

      {!tag && (
        <EmptyState title="Pick a tag" hint="Select a tag above to list every note that carries it, book-wide." />
      )}
      {tag && isLoading && <p className="label-caps">Loading…</p>}
      {tag && notes && notes.length === 0 && (
        <EmptyState title="No notes carry this tag yet" hint={tag} />
      )}
      {tag && notes && notes.length > 0 && (
        <div className="grid gap-4">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

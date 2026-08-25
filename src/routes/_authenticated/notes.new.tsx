import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/art/app-shell";
import { NoteForm } from "@/components/art/note-form";
import { createNote, type NoteInput } from "@/lib/art360";

export const Route = createFileRoute("/_authenticated/notes/new")({
  // Scoping params: /notes/new?artist=<slug>&entity=<sale_key|venue>. Prefilled so a
  // note created against a name/lot carries artist_id (and entity_key) at birth,
  // instead of landing as an orphan that search_notes can't reach by entity.
  validateSearch: (s: Record<string, unknown>) => ({
    artist: typeof s["artist"] === "string" ? (s["artist"] as string) : "",
    entity: typeof s["entity"] === "string" ? (s["entity"] as string) : "",
  }),
  head: () => ({
    meta: [
      { title: "New note — Art360" },
      { name: "description", content: "Capture a verdict, trigger, flag or observation." },
      { property: "og:title", content: "New note — Art360" },
      { property: "og:description", content: "Capture a verdict, trigger, flag or observation." },
    ],
  }),
  component: NewNote,
});

function NewNote() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { artist, entity } = Route.useSearch();
  const scoped = artist !== "";

  const save = useMutation({
    mutationFn: ({ note, tags }: { note: NoteInput; tags: string[] }) => createNote(note, tags),
    onSuccess: (_id, vars) => {
      toast.success("Note filed");
      queryClient.invalidateQueries();
      if (vars.note.artist_id) {
        navigate({ to: "/artists/$artistId", params: { artistId: vars.note.artist_id }, search: { tab: "" } });
      } else {
        navigate({ to: "/notes" });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      eyebrow="Catalogue index card"
      title="Capture a note"
      lede={
        scoped
          ? "Scoped to a name: the artist and entity keys are pre-filled so this note is never an orphan. Controlled fields draw from the database vocabulary."
          : "Every controlled field is drawn from the database vocabulary. Invalid values are rejected."
      }
    >
      <NoteForm
        prefill={{ artist_id: artist, entity_key: entity }}
        submitLabel="File note"
        pending={save.isPending}
        onSubmit={(note, tags) => save.mutate({ note, tags })}
      />
    </AppShell>
  );
}

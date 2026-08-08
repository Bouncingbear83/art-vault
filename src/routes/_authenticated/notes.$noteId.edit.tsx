import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/art/app-shell";
import { NoteForm } from "@/components/art/note-form";
import { EmptyState } from "@/components/art/primitives";
import { fetchNote, updateNote, type NoteInput } from "@/lib/art360";

export const Route = createFileRoute("/_authenticated/notes/$noteId/edit")({
  head: () => ({
    meta: [
      { title: "Edit note — Art360" },
      { name: "description", content: "Amend an existing verdict, trigger, flag or observation." },
      { property: "og:title", content: "Edit note — Art360" },
      { property: "og:description", content: "Amend an existing note in the vault." },
    ],
  }),
  component: EditNote,
});

function EditNote() {
  const { noteId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: note, isLoading } = useQuery({
    queryKey: ["note", noteId],
    queryFn: () => fetchNote(noteId),
  });

  const save = useMutation({
    mutationFn: ({ note: n, tags }: { note: NoteInput; tags: string[] }) =>
      updateNote(noteId, n, tags),
    onSuccess: (_r, vars) => {
      toast.success("Note updated");
      queryClient.invalidateQueries();
      if (vars.note.artist_id) {
        navigate({ to: "/artists/$artistId", params: { artistId: vars.note.artist_id } });
      } else {
        navigate({ to: "/register" });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell eyebrow="Catalogue index card" title="Edit note">
      {isLoading && <p className="label-caps">Loading…</p>}
      {!isLoading && !note && <EmptyState title="Note not found" />}
      {note && (
        <NoteForm
          initialNote={note}
          submitLabel="Save changes"
          pending={save.isPending}
          onSubmit={(n, tags) => save.mutate({ note: n, tags })}
        />
      )}
    </AppShell>
  );
}

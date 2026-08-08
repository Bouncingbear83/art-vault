import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/art/app-shell";
import { NoteForm } from "@/components/art/note-form";
import { createNote, type NoteInput } from "@/lib/art360";

export const Route = createFileRoute("/_authenticated/notes/new")({
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

  const save = useMutation({
    mutationFn: ({ note, tags }: { note: NoteInput; tags: string[] }) => createNote(note, tags),
    onSuccess: (_id, vars) => {
      toast.success("Note filed");
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
    <AppShell
      eyebrow="Catalogue index card"
      title="Capture a note"
      lede="Every controlled field is drawn from the database vocabulary. Invalid values are rejected."
    >
      <NoteForm
        submitLabel="File note"
        pending={save.isPending}
        onSubmit={(note, tags) => save.mutate({ note, tags })}
      />
    </AppShell>
  );
}

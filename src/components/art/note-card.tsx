import { Link } from "@tanstack/react-router";
import { Chip, PriorityTag } from "./primitives";
import { formatDate, isExpired, type NoteWithRelations } from "@/lib/art360";
import { cn } from "@/lib/utils";

export function NoteCard({ note }: { note: NoteWithRelations }) {
  const expired = isExpired(note.valid_to);
  return (
    <article
      className={cn(
        "wall-card p-5 transition-opacity",
        expired && "opacity-55 grayscale-[35%]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={note.note_type === "Verdict" ? "harbour" : "default"}>{note.note_type}</Chip>
        <Chip tone="muted">{note.scope}</Chip>
        {note.priority && <PriorityTag priority={note.priority} />}
        {note.decision && <Chip tone="ochre">{note.decision}</Chip>}
        {note.confidence && <Chip tone="muted">{note.confidence} confidence</Chip>}
        {expired && <Chip tone="ochre">Refresh</Chip>}
        <span className="num ml-auto text-xs text-muted-foreground">
          {formatDate(note.valid_from)} – {note.valid_to ? formatDate(note.valid_to) : "open"}
        </span>
      </div>

      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {note.body}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
        {note.note_tags?.length > 0 && (
          <span className="label-caps">{note.note_tags.map((t) => t.tag).join(" · ")}</span>
        )}
        {note.source_ref && (
          <span className="num text-xs text-muted-foreground">{note.source_ref}</span>
        )}
        {note.entity_key && (
          <span className="num text-xs text-muted-foreground">{note.entity_key}</span>
        )}
        <Link
          to="/notes/$noteId/edit"
          params={{ noteId: note.id }}
          className="label-caps ml-auto hover:text-foreground"
        >
          Edit
        </Link>
      </div>
    </article>
  );
}

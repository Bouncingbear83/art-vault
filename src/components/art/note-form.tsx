import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAllEnums,
  fetchArtistOptions,
  fetchNoteOptions,
  fetchTagVocab,
  type NoteInput,
  type NoteWithRelations,
} from "@/lib/art360";
import { cn } from "@/lib/utils";

const fieldClass =
  "w-full rounded-sm border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-ring";

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="label-caps">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </label>
  );
}

function EnumSelect({
  value,
  onChange,
  options,
  required,
  placeholder = "—",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <select
      className={fieldClass}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export type NoteFormValues = {
  note_type: string;
  scope: string;
  artist_id: string;
  entity_key: string;
  decision: string;
  play_type: string;
  confidence: string;
  priority: string;
  action_status: string;
  valid_from: string;
  valid_to: string;
  supersedes: string;
  source_ref: string;
  body: string;
  tags: string[];
};

const empty: NoteFormValues = {
  note_type: "",
  scope: "",
  artist_id: "",
  entity_key: "",
  decision: "",
  play_type: "",
  confidence: "",
  priority: "",
  action_status: "Open",
  valid_from: new Date().toISOString().slice(0, 10),
  valid_to: "",
  supersedes: "",
  source_ref: "",
  body: "",
  tags: [],
};

export function NoteForm({
  initialNote,
  submitLabel,
  pending,
  onSubmit,
}: {
  initialNote?: NoteWithRelations | null;
  submitLabel: string;
  pending: boolean;
  onSubmit: (note: NoteInput, tags: string[]) => void;
}) {
  const [values, setValues] = useState<NoteFormValues>(empty);
  const [artistQuery, setArtistQuery] = useState("");
  const [noteQuery, setNoteQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: enums } = useQuery({ queryKey: ["enums"], queryFn: fetchAllEnums });
  const { data: tagVocab } = useQuery({ queryKey: ["tag-vocab"], queryFn: fetchTagVocab });
  const { data: artists } = useQuery({ queryKey: ["artist-options"], queryFn: fetchArtistOptions });
  const { data: notes } = useQuery({ queryKey: ["note-options"], queryFn: fetchNoteOptions });

  useEffect(() => {
    if (!initialNote) return;
    setValues({
      note_type: initialNote.note_type,
      scope: initialNote.scope,
      artist_id: initialNote.artist_id ?? "",
      entity_key: initialNote.entity_key ?? "",
      decision: initialNote.decision ?? "",
      play_type: initialNote.play_type ?? "",
      confidence: initialNote.confidence ?? "",
      priority: initialNote.priority ?? "",
      action_status: initialNote.action_status,
      valid_from: initialNote.valid_from,
      valid_to: initialNote.valid_to ?? "",
      supersedes: initialNote.supersedes ?? "",
      source_ref: initialNote.source_ref ?? "",
      body: initialNote.body,
      tags: initialNote.note_tags?.map((t) => t.tag) ?? [],
    });
  }, [initialNote]);

  const set = <K extends keyof NoteFormValues>(key: K, value: NoteFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const filteredArtists = useMemo(() => {
    const q = artistQuery.trim().toLowerCase();
    const list = artists ?? [];
    return q ? list.filter((a) => a.name.toLowerCase().includes(q)) : list;
  }, [artists, artistQuery]);

  const filteredNotes = useMemo(() => {
    const q = noteQuery.trim().toLowerCase();
    const list = (notes ?? []).filter((n) => n.id !== initialNote?.id);
    return q
      ? list.filter((n) => `${n.note_type} ${n.body}`.toLowerCase().includes(q)).slice(0, 30)
      : list.slice(0, 30);
  }, [notes, noteQuery, initialNote?.id]);

  const allowed = (name: string, value: string) =>
    value === "" || (enums?.[name] ?? []).includes(value);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const checks: [string, string][] = [
      ["note_type", values.note_type],
      ["note_scope", values.scope],
      ["decision_kind", values.decision],
      ["play_type", values.play_type],
      ["confidence_level", values.confidence],
      ["priority_level", values.priority],
      ["action_status", values.action_status],
    ];
    for (const [enumName, value] of checks) {
      if (!allowed(enumName, value)) {
        setError(`"${value}" is not a permitted value for ${enumName}.`);
        return;
      }
    }
    if (!values.note_type || !values.scope || !values.body.trim()) {
      setError("Note type, scope and body are required.");
      return;
    }
    const validTags = new Set((tagVocab ?? []).map((t) => t.tag));
    if (values.tags.some((t) => !validTags.has(t))) {
      setError("One or more tags are outside the controlled vocabulary.");
      return;
    }

    onSubmit(
      {
        note_type: values.note_type as NonNullable<NoteInput["note_type"]>,
        scope: values.scope as NonNullable<NoteInput["scope"]>,
        artist_id: values.artist_id || null,
        entity_key: values.entity_key.trim() || null,
        decision: (values.decision || null) as NonNullable<NoteInput["decision"]> | null,
        play_type: (values.play_type || null) as NonNullable<NoteInput["play_type"]> | null,
        confidence: (values.confidence || null) as NonNullable<NoteInput["confidence"]> | null,
        priority:
          values.note_type === "Flag"
            ? ((values.priority || null) as NonNullable<NoteInput["priority"]> | null)
            : null,
        action_status: values.action_status as NonNullable<NoteInput["action_status"]>,
        valid_from: values.valid_from,
        valid_to: values.valid_to || null,
        supersedes: values.supersedes || null,
        source_ref: values.source_ref.trim() || null,
        body: values.body.trim(),
      },
      values.tags,
    );
  }

  const isFlag = values.note_type === "Flag";

  return (
    <form onSubmit={handleSubmit} className="wall-card p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Note type">
          <EnumSelect
            value={values.note_type}
            onChange={(v) => set("note_type", v)}
            options={enums?.["note_type"] ?? []}
            required
          />
        </Field>
        <Field label="Scope">
          <EnumSelect
            value={values.scope}
            onChange={(v) => set("scope", v)}
            options={enums?.["note_scope"] ?? []}
            required
          />
        </Field>

        <Field label="Artist" hint="Optional — leave blank for venue or system notes.">
          <input
            className={cn(fieldClass, "mb-2")}
            placeholder="Search artists…"
            value={artistQuery}
            onChange={(e) => setArtistQuery(e.target.value)}
          />
          <select
            className={fieldClass}
            value={values.artist_id}
            onChange={(e) => set("artist_id", e.target.value)}
          >
            <option value="">— none —</option>
            {filteredArtists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Entity key" hint="Venue or system identifier, e.g. a saleroom name.">
          <input
            className={fieldClass}
            value={values.entity_key}
            onChange={(e) => set("entity_key", e.target.value)}
          />
        </Field>

        <Field label="Decision">
          <EnumSelect
            value={values.decision}
            onChange={(v) => set("decision", v)}
            options={enums?.["decision_kind"] ?? []}
          />
        </Field>
        <Field label="Play type">
          <EnumSelect
            value={values.play_type}
            onChange={(v) => set("play_type", v)}
            options={enums?.["play_type"] ?? []}
          />
        </Field>
        <Field label="Confidence">
          <EnumSelect
            value={values.confidence}
            onChange={(v) => set("confidence", v)}
            options={enums?.["confidence_level"] ?? []}
          />
        </Field>
        {isFlag && (
          <Field label="Priority">
            <EnumSelect
              value={values.priority}
              onChange={(v) => set("priority", v)}
              options={enums?.["priority_level"] ?? []}
            />
          </Field>
        )}
        <Field label="Action status">
          <EnumSelect
            value={values.action_status}
            onChange={(v) => set("action_status", v)}
            options={enums?.["action_status"] ?? []}
            required
            placeholder="Open"
          />
        </Field>

        <Field label="Valid from">
          <input
            type="date"
            className={fieldClass}
            value={values.valid_from}
            onChange={(e) => set("valid_from", e.target.value)}
            required
          />
        </Field>
        <Field label="Valid to" hint="Notes are advisory and time-bound.">
          <input
            type="date"
            className={fieldClass}
            value={values.valid_to}
            onChange={(e) => set("valid_to", e.target.value)}
          />
        </Field>

        <Field label="Supersedes" className="sm:col-span-2">
          <input
            className={cn(fieldClass, "mb-2")}
            placeholder="Search notes…"
            value={noteQuery}
            onChange={(e) => setNoteQuery(e.target.value)}
          />
          <select
            className={fieldClass}
            value={values.supersedes}
            onChange={(e) => set("supersedes", e.target.value)}
          >
            <option value="">— none —</option>
            {filteredNotes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.note_type} · {n.valid_from} · {n.body.slice(0, 60)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Source reference" className="sm:col-span-2">
          <input
            className={fieldClass}
            value={values.source_ref}
            onChange={(e) => set("source_ref", e.target.value)}
            placeholder="Saleroom, lot, document…"
          />
        </Field>

        <Field label="Tags" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {(tagVocab ?? []).map((t) => {
              const active = values.tags.includes(t.tag);
              return (
                <button
                  type="button"
                  key={t.tag}
                  title={t.description ?? undefined}
                  onClick={() =>
                    set(
                      "tags",
                      active
                        ? values.tags.filter((x) => x !== t.tag)
                        : [...values.tags, t.tag],
                    )
                  }
                  className={cn(
                    "label-caps rounded-sm border px-2.5 py-1 transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Body" hint="Markdown accepted." className="sm:col-span-2">
          <textarea
            className={cn(fieldClass, "min-h-40 resize-y font-sans leading-relaxed")}
            value={values.body}
            onChange={(e) => set("body", e.target.value)}
            required
          />
        </Field>
      </div>

      {error && <p className="mt-5 text-sm text-destructive">{error}</p>}

      <div className="mt-7 flex items-center gap-3 border-t border-border pt-6">
        <button
          type="submit"
          disabled={pending}
          className="rounded-sm bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <p className="text-xs text-muted-foreground">
          Judgement only — Art360 never computes a buy or skip.
        </p>
      </div>
    </form>
  );
}

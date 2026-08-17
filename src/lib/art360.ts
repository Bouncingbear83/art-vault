import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Enums = Database["public"]["Enums"];
export type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
export type ArtistRow = Database["public"]["Tables"]["artists"]["Row"];
export type Artist360 = Database["public"]["Views"]["artist_360"]["Row"];
export type VocabTag = Database["public"]["Tables"]["vocab_note_tag"]["Row"];

export type NoteWithRelations = NoteRow & {
  id: string;
  artists: { id: string; name: string } | null;
  note_tags: { tag: string }[];
};

const NOTE_SELECT = "*, id:note_id, artists(id:artist_id, name:display_name), note_tags(tag)";

/** Every dropdown value comes from the database, never a hardcoded list. */
export async function fetchEnumValues(enumName: keyof Enums | string): Promise<string[]> {
  const { data, error } = await supabase
    .from("vocab_enum")
    .select("value, sort_order")
    .eq("enum_name", enumName)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((r) => r.value as string);
}

export async function fetchAllEnums() {
  const { data, error } = await supabase
    .from("vocab_enum")
    .select("enum_name, value, sort_order")
    .order("sort_order");
  if (error) throw error;
  const map: Record<string, string[]> = {};
  for (const row of data ?? []) {
    const key = row.enum_name as string;
    (map[key] ??= []).push(row.value as string);
  }
  return map;
}

export async function fetchTagVocab(): Promise<VocabTag[]> {
  const { data, error } = await supabase
    .from("vocab_note_tag")
    .select("*")
    .order("tag");
  if (error) throw error;
  return data ?? [];
}

export async function fetchOpenFlags(): Promise<NoteWithRelations[]> {
  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_SELECT)
    .eq("note_type", "Flag")
    .eq("action_status", "Open")
    .order("priority", { ascending: true })
    .order("valid_from", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as NoteWithRelations[];
}

export async function setActionStatus(id: string, status: Enums["action_status_t"]) {
  const { error } = await supabase.from("notes").update({ action_status: status }).eq("note_id", id);
  if (error) throw error;
}

export async function fetchArtist360(): Promise<Artist360[]> {
  const { data, error } = await supabase.from("artist_360").select("*").order("display_name");
  if (error) throw error;
  return data ?? [];
}

/** One roster row for The Book: the artist_360 view, read directly. */
export type BookRow = Artist360;

export async function fetchBook(): Promise<BookRow[]> {
  const { data, error } = await supabase.from("artist_360").select("*").order("display_name");
  if (error) throw error;
  return data ?? [];
}


export async function fetchArtistById(id: string): Promise<Artist360 | null> {
  const { data, error } = await supabase
    .from("artist_360")
    .select("*")
    .eq("artist_id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchArtistNotes(artistId: string): Promise<NoteWithRelations[]> {
  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_SELECT)
    .eq("artist_id", artistId)
    .order("valid_from", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as NoteWithRelations[];
}

export async function fetchArtistOptions(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from("artists").select("id:artist_id, name:display_name").order("display_name");
  if (error) throw error;
  return (data ?? []) as unknown as { id: string; name: string }[];
}

export async function fetchNoteOptions(): Promise<
  { id: string; note_type: string; body: string; valid_from: string }[]
> {
  const { data, error } = await supabase
    .from("notes")
    .select("id:note_id, note_type, body, valid_from")
    .order("valid_from", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as { id: string; note_type: string; body: string; valid_from: string }[];
}

export async function fetchNote(id: string): Promise<NoteWithRelations | null> {
  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_SELECT)
    .eq("note_id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as NoteWithRelations | null;
}

export type NoteInput = Database["public"]["Tables"]["notes"]["Insert"];

export async function createNote(note: NoteInput, tags: string[]) {
  const { data, error } = await supabase.from("notes").insert(note).select("note_id").single();
  if (error) throw error;
  if (tags.length) {
    const { error: tagError } = await supabase
      .from("note_tags")
      .insert(tags.map((tag) => ({ note_id: data.note_id, tag })));
    if (tagError) {
      // keep the vault consistent: no orphan note without its tags
      await supabase.from("notes").delete().eq("note_id", data.note_id);
      throw tagError;
    }
  }
  return data.note_id;
}

export async function updateNote(id: string, note: NoteInput, tags: string[]) {
  const { error } = await supabase.from("notes").update(note).eq("note_id", id);
  if (error) throw error;
  const { error: delError } = await supabase.from("note_tags").delete().eq("note_id", id);
  if (delError) throw delError;
  if (tags.length) {
    const { error: tagError } = await supabase
      .from("note_tags")
      .insert(tags.map((tag) => ({ note_id: id, tag })));
    if (tagError) throw tagError;
  }
}

/* ---------- presentation helpers ---------- */

export function isExpired(validTo: string | null): boolean {
  if (!validTo) return false;
  return new Date(validTo) < new Date(new Date().toDateString());
}

export function ageInDays(from: string): number {
  const ms = Date.now() - new Date(from).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function gbp(value: number | null): string {
  if (value == null) return "—";
  return "£" + Math.round(value).toLocaleString("en-GB");
}

export function pct(value: number | null): string {
  if (value == null) return "—";
  return `${Number(value).toFixed(1)}%`;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Every note carrying a given tag, across all names, newest first.
 *  Two-step so each returned card still shows ALL its tags, not just the filtered one. */
export async function fetchNotesByTag(tag: string): Promise<NoteWithRelations[]> {
  const { data: ids, error: idErr } = await supabase
    .from("note_tags")
    .select("note_id")
    .eq("tag", tag);
  if (idErr) throw idErr;

  const noteIds = (ids ?? []).map((r) => r.note_id);
  if (!noteIds.length) return [];

  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_SELECT)
    .in("note_id", noteIds)
    .order("valid_from", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as NoteWithRelations[];
}

/** The controlled tag vocab with a live usage count, for the browse cloud.
 *  Includes zero-count tags so newly-added vocab is visible (dimmed) before first use. */
export async function fetchTagCounts(): Promise
  { tag: string; description: string | null; count: number }[]
> {
  const [vocabRes, usedRes] = await Promise.all([
    supabase.from("vocab_note_tag").select("*").order("tag"),
    supabase.from("note_tags").select("tag"),
  ]);
  if (vocabRes.error) throw vocabRes.error;
  if (usedRes.error) throw usedRes.error;

  const counts = new Map<string, number>();
  for (const r of usedRes.data ?? []) counts.set(r.tag, (counts.get(r.tag) ?? 0) + 1);

  return (vocabRes.data ?? []).map((v) => ({
    tag: v.tag,
    description: v.description,
    count: counts.get(v.tag) ?? 0,
  }));
}

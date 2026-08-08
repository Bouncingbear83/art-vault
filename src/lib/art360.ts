import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Enums = Database["public"]["Enums"];
export type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
export type ArtistRow = Database["public"]["Tables"]["artists"]["Row"];
export type Artist360 = Database["public"]["Views"]["artist_360"]["Row"];
export type VocabTag = Database["public"]["Tables"]["vocab_note_tag"]["Row"];

export type NoteWithRelations = NoteRow & {
  artists: { id: string; name: string } | null;
  note_tags: { tag: string }[];
};

const NOTE_SELECT = "*, artists(id, name), note_tags(tag)";

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
    .order("sort_order");
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

export async function setActionStatus(id: string, status: Enums["action_status"]) {
  const { error } = await supabase.from("notes").update({ action_status: status }).eq("id", id);
  if (error) throw error;
}

export async function fetchArtist360(): Promise<Artist360[]> {
  const { data, error } = await supabase.from("artist_360").select("*").order("name");
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
  const { data, error } = await supabase.from("artists").select("id, name").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchNoteOptions(): Promise<
  { id: string; note_type: string; body: string; valid_from: string }[]
> {
  const { data, error } = await supabase
    .from("notes")
    .select("id, note_type, body, valid_from")
    .order("valid_from", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function fetchNote(id: string): Promise<NoteWithRelations | null> {
  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as NoteWithRelations | null;
}

export type NoteInput = Database["public"]["Tables"]["notes"]["Insert"];

export async function createNote(note: NoteInput, tags: string[]) {
  const { data, error } = await supabase.from("notes").insert(note).select("id").single();
  if (error) throw error;
  if (tags.length) {
    const { error: tagError } = await supabase
      .from("note_tags")
      .insert(tags.map((tag) => ({ note_id: data.id, tag })));
    if (tagError) {
      // keep the vault consistent: no orphan note without its tags
      await supabase.from("notes").delete().eq("id", data.id);
      throw tagError;
    }
  }
  return data.id;
}

export async function updateNote(id: string, note: NoteInput, tags: string[]) {
  const { error } = await supabase.from("notes").update(note).eq("id", id);
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

import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { ACTION, CONFIDENCE, DECISION, NOTE_TYPE, PLAY_TYPE, PRIORITY, SCOPE, errorResult, textResult, today } from "../shared";

export default defineTool({
  name: "create_note",
  title: "Create note",
  description:
    "Create a note in the Art360 vault. Enforces the schema constraints (Artist-scope requires artist_id; Flag requires priority) and rejects unknown tags.",
  inputSchema: {
    note_type: z.enum(NOTE_TYPE),
    scope: z.enum(SCOPE),
    body: z.string().trim().min(1).describe("The note text."),
    artist_id: z.string().optional().describe("Canonical slug, required when scope=Artist."),
    entity_key: z.string().optional().describe("Venue / subject / sale_key when scope<>Artist."),
    decision: z.enum(DECISION).optional(),
    action_status: z.enum(ACTION).optional(),
    play_type: z.enum(PLAY_TYPE).optional(),
    confidence: z.enum(CONFIDENCE).optional(),
    priority: z.enum(PRIORITY).optional().describe("Required when note_type=Flag."),
    valid_from: z.string().optional().describe("ISO date; defaults to today."),
    valid_to: z.string().optional().describe("ISO date; null = evergreen."),
    supersedes: z.string().optional().describe("note_id of the note this replaces."),
    source_ref: z.string().optional().describe("dump / sale_key / csv that generated it."),
    slug: z.string().optional().describe("Human key e.g. 2026-08-08-danby-verdict-01."),
    tags: z.array(z.string()).optional().describe("Must exist in vocab_note_tag."),
    created_by: z.string().optional().describe("claude | bert | app. Defaults to claude."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  handler: async (a, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const sb = supabaseForUser(ctx);

    if (a.scope === "Artist" && !a.artist_id) throw new ToolError("scope=Artist requires artist_id");
    if (a.note_type === "Flag" && !a.priority) throw new ToolError("note_type=Flag requires priority");

    if (a.artist_id) {
      const { data: art } = await sb.from("artists").select("artist_id").eq("artist_id", a.artist_id).maybeSingle();
      if (!art) throw new ToolError(`unknown artist_id "${a.artist_id}" (not in artists roster)`);
    }

    const tags = a.tags ?? [];
    if (tags.length) {
      const { data: known } = await sb.from("vocab_note_tag").select("tag").in("tag", tags);
      const knownSet = new Set((known ?? []).map((r: { tag: string }) => r.tag));
      const bad = tags.filter((t) => !knownSet.has(t));
      if (bad.length) throw new ToolError(`unknown tag(s): ${bad.join(", ")} (add to vocab_note_tag first)`);
    }

    const row = {
      slug: a.slug ?? null,
      note_type: a.note_type,
      scope: a.scope,
      artist_id: a.artist_id ?? null,
      entity_key: a.entity_key ?? null,
      decision: a.decision ?? "No_Action",
      action_status: a.action_status ?? "Open",
      play_type: a.play_type ?? "NA",
      confidence: a.confidence ?? "Med",
      priority: a.priority ?? null,
      valid_from: a.valid_from ?? today(),
      valid_to: a.valid_to ?? null,
      supersedes: a.supersedes ?? null,
      source_ref: a.source_ref ?? null,
      body: a.body,
      created_by: a.created_by ?? "claude",
    };

    const { data: note, error } = await sb.from("notes").insert(row).select().single();
    if (error) throw new ToolError(`insert failed: ${error.message}`);

    if (tags.length) {
      const { error: tErr } = await sb.from("note_tags").insert(tags.map((t) => ({ note_id: note.note_id, tag: t })));
      if (tErr) throw new ToolError(`note created (${note.note_id}) but tag insert failed: ${tErr.message}`);
    }

    return textResult({ created: true, note_id: note.note_id, slug: note.slug, tags });
  },
});

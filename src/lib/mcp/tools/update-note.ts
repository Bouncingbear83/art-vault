import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { ACTION, errorResult, textResult } from "../shared";

// Wraps the public.update_note RPC (atomic tag swap + metadata patch).
// Deliberately NOT re-implemented in JS: doing the notes update and the
// note_tags delete/insert here would reintroduce the non-atomic tag bug
// that create-note still carries. The RPC does it in one transaction.
export default defineTool({
  name: "update_note",
  title: "Update note",
  description:
    "Update a note's tags, valid_to (review horizon) and/or action_status in place, atomically. " +
    "Keyed by note_id or slug. Omitted fields are left untouched; pass tags=[] to clear all tags, " +
    "or clear_valid_to=true to make the note evergreen. Unknown tags are rejected. " +
    "Use this to re-tag or set an expiry without a supersede.",
  inputSchema: {
    note_id: z.string().optional(),
    slug: z.string().optional(),
    tags: z
      .array(z.string())
      .optional()
      .describe("Replace the tag set; omit to leave untouched, [] to clear. Must exist in vocab_note_tag."),
    valid_to: z.string().optional().describe("ISO date review horizon; omit to leave unchanged."),
    clear_valid_to: z.boolean().optional().describe("Set true to force valid_to null (evergreen); overrides valid_to."),
    action_status: z.enum(ACTION).optional().describe("New status; omit to leave unchanged."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async (a, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const sb = supabaseForUser(ctx);

    if (!a.note_id && !a.slug) throw new ToolError("provide note_id or slug");
    if (a.tags === undefined && a.valid_to === undefined && !a.clear_valid_to && !a.action_status) {
      throw new ToolError("nothing to update: provide tags, valid_to, clear_valid_to, and/or action_status");
    }

    // The RPC is keyed by note_id; resolve slug first for parity with update_flag.
    let noteId = a.note_id;
    if (!noteId && a.slug) {
      const { data: n, error } = await sb.from("notes").select("note_id").eq("slug", a.slug).maybeSingle();
      if (error) throw new ToolError(`lookup failed: ${error.message}`);
      if (!n) throw new ToolError(`no note matched slug "${a.slug}"`);
      noteId = n.note_id;
    }

    const { data, error } = await sb.rpc("update_note", {
      p_note_id: noteId,
      p_tags: a.tags ?? null,
      p_valid_to: a.valid_to ?? null,
      p_clear_valid_to: a.clear_valid_to ?? false,
      p_action_status: a.action_status ?? null,
    });
    if (error) throw new ToolError(`update_note failed: ${error.message}`);

    return textResult(data);
  },
});

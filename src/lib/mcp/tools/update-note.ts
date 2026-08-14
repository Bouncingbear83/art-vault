// =====================================================================
// ART360 :: update_note MCP tool  (edge-function side)
// Exposes the public.update_note RPC (see art360_update_note.sql) as an
// Art360: MCP tool so future metadata fixes go through the MCP, not the
// SQL editor. Framework-agnostic: drop the descriptor into your tools
// array and the handler into your dispatch switch. Two wiring points are
// marked  <<< WIRE >>>  below — match them to your existing server file.
//
// Assumes the same service_role Supabase client the other tools already use.
// =====================================================================
 
// ---------- 1) Tool descriptor  <<< WIRE: add to the tools[] array >>> --
export const updateNoteTool = {
  name: "update_note",
  description:
    "Update a note's tags, valid_to (review horizon) and/or action_status in place, " +
    "atomically. Use to re-tag, set/clear an expiry, or flip status without a supersede. " +
    "Keyed by note_id. Fields left undefined are untouched; pass tags=[] to clear all tags, " +
    "or clear_valid_to=true to make a note evergreen.",
  inputSchema: {
    type: "object",
    properties: {
      note_id: { type: "string", description: "UUID of the note to update." },
      tags: {
        type: "array",
        items: { type: "string" },
        description:
          "Replace the note's tags with exactly this set. Omit to leave tags untouched; " +
          "pass [] to clear. Every tag must exist in vocab_note_tag or the call rejects.",
      },
      valid_to: {
        type: "string",
        description: "ISO date review horizon (e.g. 2026-11-12). Omit to leave unchanged.",
      },
      clear_valid_to: {
        type: "boolean",
        description: "Set true to force valid_to null (evergreen). Overrides valid_to.",
      },
      action_status: {
        type: "string",
        enum: ["Open", "Actioned", "Superseded", "Wontfix", "Archived"],
        description: "New status. Omit to leave unchanged.",
      },
    },
    required: ["note_id"],
  },
};
 
// ---------- 2) Handler  <<< WIRE: add a case to the dispatch switch >>> --
// e.g.  case "update_note": return await handleUpdateNote(args, supabase);
export async function handleUpdateNote(
  args: {
    note_id: string;
    tags?: string[];
    valid_to?: string;
    clear_valid_to?: boolean;
    action_status?: string;
  },
  supabase: any, // the service_role SupabaseClient the other tools use
) {
  if (!args?.note_id) {
    return toolError("update_note requires note_id.");
  }
 
  const { data, error } = await supabase.rpc("update_note", {
    p_note_id: args.note_id,
    // undefined -> the SQL default (null / false) -> "leave untouched"
    p_tags: args.tags ?? null,
    p_valid_to: args.valid_to ?? null,
    p_clear_valid_to: args.clear_valid_to ?? false,
    p_action_status: args.action_status ?? null,
  });
 
  if (error) {
    // Surface the DB's own message (unknown tag, note not found, etc.).
    return toolError(`update_note failed: ${error.message}`);
  }
 
  // data is the note row + tags[] (jsonb from the RPC), mirroring search_notes.
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}
 
// ---------- tiny helper (drop if your server already has one) ----------
function toolError(msg: string) {
  return { content: [{ type: "text", text: msg }], isError: true };
}

import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { ACTION, PRIORITY, errorResult, textResult } from "../shared";

export default defineTool({
  name: "update_flag",
  title: "Update flag",
  description:
    "Update a note's action_status and/or priority. Keyed by note_id or slug. Use to action/supersede/archive a flag.",
  inputSchema: {
    note_id: z.string().optional(),
    slug: z.string().optional(),
    action_status: z.enum(ACTION).optional(),
    priority: z.enum(PRIORITY).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async (a, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const sb = supabaseForUser(ctx);

    if (!a.note_id && !a.slug) throw new ToolError("provide note_id or slug");
    if (!a.action_status && !a.priority) throw new ToolError("provide action_status and/or priority to update");

    const patch: Record<string, string> = {};
    if (a.action_status) patch["action_status"] = a.action_status;
    if (a.priority) patch["priority"] = a.priority;

    let q = sb.from("notes").update(patch).select();
    q = a.note_id ? q.eq("note_id", a.note_id) : q.eq("slug", a.slug!);

    const { data, error } = await q;
    if (error) throw new ToolError(`update failed: ${error.message}`);
    if (!data || !data.length) throw new ToolError("no note matched that note_id/slug");

    return textResult({ updated: data.length, notes: data });
  },
});

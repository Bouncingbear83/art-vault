import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { errorResult, textResult, today } from "../shared";

export default defineTool({
  name: "get_artist360",
  title: "Get artist 360",
  description:
    "Return the artist_360 surface (verdict facets + comps_rollup quant + open-flag count) for one artist, plus their open, non-expired notes.",
  inputSchema: { artist_id: z.string().min(1) },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (a, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const sb = supabaseForUser(ctx);

    const { data: surface, error } = await sb
      .from("artist_360")
      .select("*")
      .eq("artist_id", a.artist_id)
      .maybeSingle();
    if (error) throw new ToolError(`view read failed: ${error.message}`);
    if (!surface) throw new ToolError(`unknown artist_id "${a.artist_id}"`);

    const { data: openNotes } = await sb
      .from("notes")
      .select("note_id, slug, note_type, scope, decision, priority, confidence, valid_from, valid_to, body")
      .eq("artist_id", a.artist_id)
      .eq("action_status", "Open")
      .or(`valid_to.is.null,valid_to.gte.${today()}`)
      .order("priority", { ascending: true })
      .order("valid_from", { ascending: false });

    return textResult({ surface, open_notes: openNotes ?? [] });
  },
});

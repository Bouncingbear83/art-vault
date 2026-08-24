import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { ACTION, DECISION, NOTE_TYPE, PRIORITY, SCOPE, errorResult, textResult, today } from "../shared";

export default defineTool({
  name: "search_notes",
  title: "Search notes",
  description:
    "Search the vault. `query` matches body, entity_key, slug and artist_id (case-insensitive substring). Excludes expired notes (valid_to < today) unless include_expired=true; always flags expired rows rather than hiding them.",
  inputSchema: {
    artist_id: z.string().optional(),
    scope: z.enum(SCOPE).optional(),
    note_type: z.enum(NOTE_TYPE).optional(),
    action_status: z.enum(ACTION).optional(),
    decision: z.enum(DECISION).optional(),
    priority: z.enum(PRIORITY).optional(),
    tag: z.string().optional().describe("Single tag from vocab_note_tag."),
    query: z.string().optional().describe("Case-insensitive substring match on body, entity_key, slug and artist_id."),
    include_expired: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (a, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const sb = supabaseForUser(ctx);

    const includeExpired = a.include_expired === true;
    const limit = Math.min(a.limit ?? 25, 100);
    const sel = a.tag ? "*, note_tags!inner(tag)" : "*, note_tags(tag)";

    let q = sb.from("notes").select(sel).order("valid_from", { ascending: false }).limit(limit);
    if (a.artist_id) q = q.eq("artist_id", a.artist_id);
    if (a.scope) q = q.eq("scope", a.scope);
    if (a.note_type) q = q.eq("note_type", a.note_type);
    if (a.action_status) q = q.eq("action_status", a.action_status);
    if (a.decision) q = q.eq("decision", a.decision);
    if (a.priority) q = q.eq("priority", a.priority);
    if (a.tag) q = q.eq("note_tags.tag", a.tag);
    if (a.query) {
      // Match identity columns too, not just body: notes frequently carry the
      // artist/entity name only in entity_key / slug / artist_id, so a body-only
      // search silently misses them (this caused a false "missing notes" audit).
      const v = a.query.replace(/["\\]/g, (c) => `\\${c}`); // quote-safe for PostgREST .or()
      q = q.or(
        [
          `body.ilike."%${v}%"`,
          `entity_key.ilike."%${v}%"`,
          `slug.ilike."%${v}%"`,
          `artist_id.ilike."%${v}%"`,
        ].join(","),
      );
    }
    if (!includeExpired) q = q.or(`valid_to.is.null,valid_to.gte.${today()}`);

    const { data, error } = await q;
    if (error) throw new ToolError(`search failed: ${error.message}`);

    const t = today();
    const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
      const { note_tags, ...rest } = r as Record<string, unknown> & { note_tags?: Array<{ tag: string }> };
      return {
        ...rest,
        tags: (note_tags ?? []).map((x) => x.tag),
        expired: typeof r["valid_to"] === "string" && (r["valid_to"] as string) < t,
      };
    });

    return textResult({ count: rows.length, include_expired: includeExpired, notes: rows });
  },
});

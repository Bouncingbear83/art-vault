// =====================================================================
// ART360 :: MCP endpoint (v1)
// Typed write+read path from Claude chat into the notes vault.
// JSON-RPC 2.0 over Streamable HTTP. Service role bypasses RLS.
//
// URL: https://<app>/api/public/mcp  (register as a Claude custom connector)
//
// Auth: if MCP_SHARED_SECRET is set, the caller must send
//   Authorization: Bearer <secret>. Set it before any real use.
// =====================================================================
import { createFileRoute } from "@tanstack/react-router";

// ---------- Controlled values (must match the SQL enums verbatim) ----
const NOTE_TYPE = ["Verdict", "Classification", "Trigger", "Flag", "Learning", "Playbook", "Lot"];
const SCOPE = ["Artist", "Venue", "Subject", "Medium", "System", "Portfolio", "Lot"];
const DECISION = ["Reclassify", "Set_Trigger", "Add_Vocab", "Patch_Taxonomy", "Buy", "Skip", "Monitor", "No_Action"];
const ACTION = ["Open", "Actioned", "Superseded", "Wontfix", "Archived"];
const CONFIDENCE = ["High", "Med", "Low"];
const PRIORITY = ["P1", "P2", "P3"];
const PLAY_TYPE = ["Arbitrage", "Quality_hold", "Pending", "NA"];

type Args = Record<string, any>;
type Db = any;

const today = () => new Date().toISOString().slice(0, 10);

async function db(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

// ---------- Validation helpers ---------------------------------------
class ToolError extends Error {}

function must(cond: unknown, msg: string): void {
  if (!cond) throw new ToolError(msg);
}
function enumOk(val: string | undefined, set: string[], field: string) {
  if (val === undefined || val === null) return;
  must(set.includes(val), `${field} must be one of: ${set.join(", ")} (got "${val}")`);
}

// ---------- Tool: create_note ----------------------------------------
async function createNote(a: Args) {
  const sb = await db();
  must(a.note_type, "note_type is required");
  must(a.scope, "scope is required");
  must(a.body && String(a.body).trim(), "body is required");

  enumOk(a.note_type, NOTE_TYPE, "note_type");
  enumOk(a.scope, SCOPE, "scope");
  enumOk(a.decision, DECISION, "decision");
  enumOk(a.action_status, ACTION, "action_status");
  enumOk(a.confidence, CONFIDENCE, "confidence");
  enumOk(a.priority, PRIORITY, "priority");
  enumOk(a.play_type, PLAY_TYPE, "play_type");

  // CHECK constraints, pre-flighted for clean errors
  must(a.scope !== "Artist" || a.artist_id, "scope=Artist requires artist_id");
  must(a.note_type !== "Flag" || a.priority, "note_type=Flag requires priority");

  if (a.artist_id) {
    const { data: art } = await sb.from("artists").select("artist_id").eq("artist_id", a.artist_id).maybeSingle();
    must(art, `unknown artist_id "${a.artist_id}" (not in artists roster)`);
  }

  const tags: string[] = Array.isArray(a.tags) ? a.tags : [];
  if (tags.length) {
    const { data: known } = await sb.from("vocab_note_tag").select("tag").in("tag", tags);
    const knownSet = new Set((known ?? []).map((r: any) => r.tag));
    const bad = tags.filter((t) => !knownSet.has(t));
    must(bad.length === 0, `unknown tag(s): ${bad.join(", ")} (add to vocab_note_tag first)`);
  }

  const row: Args = {
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

  // Tags: junction rows. NB: not atomic with the note insert.
  if (tags.length) {
    const { error: tErr } = await sb.from("note_tags").insert(tags.map((t) => ({ note_id: note.note_id, tag: t })));
    if (tErr) throw new ToolError(`note created (${note.note_id}) but tag insert failed: ${tErr.message}`);
  }

  return { created: true, note_id: note.note_id, slug: note.slug, tags };
}

// ---------- Tool: search_notes ---------------------------------------
async function searchNotes(a: Args) {
  const sb = await db();
  enumOk(a.scope, SCOPE, "scope");
  enumOk(a.note_type, NOTE_TYPE, "note_type");
  enumOk(a.action_status, ACTION, "action_status");
  enumOk(a.decision, DECISION, "decision");
  enumOk(a.priority, PRIORITY, "priority");

  const includeExpired = a.include_expired === true;
  const limit = Math.min(Number(a.limit ?? 25), 100);

  const sel = a.tag ? "*, note_tags!inner(tag)" : "*, note_tags(tag)";
  let q = sb.from("notes").select(sel).order("valid_from", { ascending: false }).limit(limit);

  if (a.artist_id) q = q.eq("artist_id", a.artist_id);
  if (a.scope) q = q.eq("scope", a.scope);
  if (a.note_type) q = q.eq("note_type", a.note_type);
  if (a.action_status) q = q.eq("action_status", a.action_status);
  if (a.decision) q = q.eq("decision", a.decision);
  if (a.priority) q = q.eq("priority", a.priority);
  if (a.tag) q = q.eq("note_tags.tag", a.tag);
  if (a.query) q = q.ilike("body", `%${a.query}%`);
  if (!includeExpired) q = q.or(`valid_to.is.null,valid_to.gte.${today()}`);

  const { data, error } = await q;
  if (error) throw new ToolError(`search failed: ${error.message}`);

  const t = today();
  const rows = (data ?? []).map((r: any) => ({
    ...r,
    tags: (r.note_tags ?? []).map((x: any) => x.tag),
    note_tags: undefined,
    expired: r.valid_to != null && r.valid_to < t, // surface staleness, never hide it
  }));
  return { count: rows.length, include_expired: includeExpired, notes: rows };
}

// ---------- Tool: update_flag ----------------------------------------
async function updateFlag(a: Args) {
  const sb = await db();
  must(a.note_id || a.slug, "provide note_id or slug");
  must(a.action_status || a.priority, "provide action_status and/or priority to update");
  enumOk(a.action_status, ACTION, "action_status");
  enumOk(a.priority, PRIORITY, "priority");

  const patch: Args = {};
  if (a.action_status) patch.action_status = a.action_status;
  if (a.priority) patch.priority = a.priority;

  let q = sb.from("notes").update(patch).select();
  q = a.note_id ? q.eq("note_id", a.note_id) : q.eq("slug", a.slug);

  const { data, error } = await q;
  if (error) throw new ToolError(`update failed: ${error.message}`);
  must(data && data.length, "no note matched that note_id/slug");
  return { updated: data.length, notes: data };
}

// ---------- Tool: get_artist360 --------------------------------------
async function getArtist360(a: Args) {
  const sb = await db();
  must(a.artist_id, "artist_id is required");

  const { data: surface, error } = await sb.from("artist_360").select("*").eq("artist_id", a.artist_id).maybeSingle();
  if (error) throw new ToolError(`view read failed: ${error.message}`);
  must(surface, `unknown artist_id "${a.artist_id}"`);

  const t = today();
  const { data: openNotes } = await sb
    .from("notes")
    .select("note_id, slug, note_type, scope, decision, priority, confidence, valid_from, valid_to, body")
    .eq("artist_id", a.artist_id)
    .eq("action_status", "Open")
    .or(`valid_to.is.null,valid_to.gte.${t}`)
    .order("priority", { ascending: true })
    .order("valid_from", { ascending: false });

  return { surface, open_notes: openNotes ?? [] };
}

// ---------- Tool registry + JSON schemas -----------------------------
const TOOLS = [
  {
    name: "create_note",
    description:
      "Create a note in the Art360 vault. Enforces the schema constraints (Artist-scope requires artist_id; Flag requires priority) and rejects unknown tags. Never sets buy/skip: the app adjudicates nothing.",
    inputSchema: {
      type: "object",
      properties: {
        note_type: { type: "string", enum: NOTE_TYPE },
        scope: { type: "string", enum: SCOPE },
        body: { type: "string", description: "The note text." },
        artist_id: { type: "string", description: "Canonical slug, required when scope=Artist." },
        entity_key: { type: "string", description: "Venue / subject / sale_key when scope<>Artist." },
        decision: { type: "string", enum: DECISION },
        action_status: { type: "string", enum: ACTION },
        play_type: { type: "string", enum: PLAY_TYPE },
        confidence: { type: "string", enum: CONFIDENCE },
        priority: { type: "string", enum: PRIORITY, description: "Required when note_type=Flag." },
        valid_from: { type: "string", description: "ISO date; defaults to today." },
        valid_to: { type: "string", description: "ISO date; null = evergreen. Expiry forces refresh." },
        supersedes: { type: "string", description: "note_id of the note this replaces." },
        source_ref: { type: "string", description: "dump / sale_key / csv that generated it." },
        slug: { type: "string", description: "Human key e.g. 2026-08-08-danby-verdict-01." },
        tags: { type: "array", items: { type: "string" }, description: "Must exist in vocab_note_tag." },
        created_by: { type: "string", description: "claude | bert | app. Defaults to claude." },
      },
      required: ["note_type", "scope", "body"],
    },
  },
  {
    name: "search_notes",
    description:
      "Search the vault. Excludes expired notes (valid_to < today) unless include_expired=true; always flags expired rows rather than hiding them.",
    inputSchema: {
      type: "object",
      properties: {
        artist_id: { type: "string" },
        scope: { type: "string", enum: SCOPE },
        note_type: { type: "string", enum: NOTE_TYPE },
        action_status: { type: "string", enum: ACTION },
        decision: { type: "string", enum: DECISION },
        priority: { type: "string", enum: PRIORITY },
        tag: { type: "string", description: "Single tag from vocab_note_tag." },
        query: { type: "string", description: "Case-insensitive substring match on body." },
        include_expired: { type: "boolean", description: "Default false." },
        limit: { type: "integer", description: "Default 25, max 100." },
      },
    },
  },
  {
    name: "update_flag",
    description:
      "Update a note's action_status and/or priority. Keyed by note_id or slug. Use to action/supersede/archive a flag.",
    inputSchema: {
      type: "object",
      properties: {
        note_id: { type: "string" },
        slug: { type: "string" },
        action_status: { type: "string", enum: ACTION },
        priority: { type: "string", enum: PRIORITY },
      },
    },
  },
  {
    name: "get_artist360",
    description:
      "Return the artist_360 surface (verdict facets + comps_rollup quant + open-flag count) for one artist, plus their open, non-expired notes.",
    inputSchema: {
      type: "object",
      properties: { artist_id: { type: "string" } },
      required: ["artist_id"],
    },
  },
];

const HANDLERS: Record<string, (a: Args) => Promise<unknown>> = {
  create_note: createNote,
  search_notes: searchNotes,
  update_flag: updateFlag,
  get_artist360: getArtist360,
};

// ---------- JSON-RPC dispatch ----------------------------------------
const PROTOCOL_DEFAULT = "2025-06-18";

async function dispatch(msg: any): Promise<any | null> {
  const { id, method, params } = msg ?? {};

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? PROTOCOL_DEFAULT,
          capabilities: { tools: {} },
          serverInfo: { name: "art360-mcp", version: "1.0.0" },
        },
      };

    case "notifications/initialized":
      return null; // notification: no response

    case "ping":
      return { jsonrpc: "2.0", id, result: {} };

    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };

    case "tools/call": {
      const name = params?.name;
      const handler = HANDLERS[name];
      if (!handler) {
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `unknown tool: ${name}` } };
      }
      try {
        const result = await handler(params?.arguments ?? {});
        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
        };
      } catch (e) {
        const msg = e instanceof ToolError ? e.message : `internal error: ${String(e)}`;
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: msg }], isError: true } };
      }
    }

    default:
      if (id === undefined) return null; // unknown notification
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } };
  }
}

// ---------- HTTP handler ---------------------------------------------
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version",
};

function authOk(req: Request): boolean {
  const secret = process.env["MCP_SHARED_SECRET"];
  if (!secret) return true; // no secret set: open. Set one before real use.
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export const Route = createFileRoute("/api/public/mcp")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: CORS }),
      GET: () => new Response("method not allowed", { status: 405, headers: CORS }),
      POST: async ({ request }) => {
        if (!authOk(request)) {
          return new Response(JSON.stringify({ error: "unauthorised" }), {
            status: 401,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }),
            { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        }

        // Support single message or a JSON-RPC batch.
        const out = Array.isArray(body)
          ? (await Promise.all(body.map(dispatch))).filter((r) => r !== null)
          : await dispatch(body);

        if (out === null || (Array.isArray(out) && out.length === 0)) {
          return new Response(null, { status: 202, headers: CORS });
        }
        return new Response(JSON.stringify(out), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      },
    },
  },
});

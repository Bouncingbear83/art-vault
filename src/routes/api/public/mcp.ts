// =====================================================================
// ART360 :: MCP endpoint — /api/public/mcp
// Auth: Authorization: Bearer <MCP_SHARED_SECRET>, or ?k=<secret>.
// Clients that strip the query string should use /api/public/mcp/<secret>
// instead (see mcp.$key.ts) — a path segment survives URL normalisation.
// =====================================================================
import { createFileRoute } from "@tanstack/react-router";
import { CORS, handleRpcPost, sharedSecret, unauthorised } from "@/lib/mcp-core.server";

function authOk(req: Request): boolean {
  const secret = sharedSecret();
  if (!secret) return true; // no secret set: open. Set one before real use.
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  try {
    return new URL(req.url).searchParams.get("k") === secret;
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/mcp")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: CORS }),
      GET: () => new Response("method not allowed", { status: 405, headers: CORS }),
      POST: async ({ request }) => (authOk(request) ? handleRpcPost(request) : unauthorised()),
    },
  },
});

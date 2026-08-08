// =====================================================================
// ART360 :: MCP endpoint — /api/public/mcp/<secret>
// The secret travels as a path segment because connector clients (Claude)
// normalise the server URL and drop query strings, which produced a 401 and
// pushed them into an OAuth registration flow this server does not implement.
// =====================================================================
import { createFileRoute } from "@tanstack/react-router";
import { CORS, handleRpcPost, sharedSecret, unauthorised } from "@/lib/mcp-core.server";

function keyOk(key: string | undefined): boolean {
  const secret = sharedSecret();
  if (!secret) return true; // no secret set: open. Set one before real use.
  return key === secret;
}

export const Route = createFileRoute("/api/public/mcp/$key")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: CORS }),
      GET: () => new Response("method not allowed", { status: 405, headers: CORS }),
      POST: async ({ request, params }) =>
        keyOk(params.key) ? handleRpcPost(request) : unauthorised(),
    },
  },
});

# Let Claude connect to the vault with a secret in the URL

Claude's "Add custom connector" dialog only offers OAuth Client ID/Secret — there is no field for a bearer token. So the shared secret has to travel in the server URL instead of a header.

## What changes

One file: the MCP endpoint's auth check (`src/routes/api/public/mcp.ts`).

Today it accepts a request only if the `Authorization: Bearer <MCP_SHARED_SECRET>` header matches. After the change it accepts **either**:

- the existing `Authorization: Bearer <secret>` header (so curl testing and any future client keep working), or
- a `?k=<secret>` query parameter on the URL.

Comparison stays constant-time-ish and the secret is never echoed back in responses or errors. If `MCP_SHARED_SECRET` is unset the endpoint stays open exactly as now.

The `OPTIONS` preflight and CORS headers are untouched.

## What you do in Claude

1. Publish the app (the endpoint must be live).
2. Settings → Connectors → Add custom connector:
   - **Name:** Art360
   - **Remote MCP server URL:** `https://canvas-verdict.lovable.app/api/public/mcp?k=YOUR_SECRET`
   - **Advanced settings:** leave both OAuth fields blank.
3. Claude runs the handshake and lists the four tools: `create_note`, `search_notes`, `update_flag`, `get_artist360`.

## Trade-off worth knowing

Anyone who obtains that full URL has full read/write access to the vault, and URLs are easier to leak than headers (browser history, screenshots, pasted links). Treat it like a password. If it ever leaks, save a new `MCP_SHARED_SECRET` value and re-register the connector with the new URL — no code change needed.

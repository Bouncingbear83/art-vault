# Fix the Claude connector: move the secret into the URL path

## What's actually happening

Probing the live endpoint shows Claude never sends the `?k=` secret — connector clients normalise the server URL and drop the query string. So the endpoint answers 401, Claude assumes the server wants OAuth, tries to register itself with a sign-in service that doesn't exist, and shows the `ofid_...` error.

A path segment survives that normalisation where a query parameter does not.

## The change

Add a second MCP route that carries the secret as a path segment, reusing the exact same JSON-RPC handler and tools:

```text
https://canvas-verdict.lovable.app/api/public/mcp/<YOUR_SECRET>
```

- Extract the shared dispatcher, tool definitions, and validation out of `src/routes/api/public/mcp.ts` into a helper module so there is one implementation, not a copy.
- New route `src/routes/api/public/mcp.$key.ts`: authorises when the path segment equals `MCP_SHARED_SECRET`, otherwise 401.
- The existing `/api/public/mcp` route keeps working unchanged (header or `?k=`), so curl testing and any future client are unaffected.
- Neither route ever sends a `WWW-Authenticate` header, so a failed call won't push a client into the OAuth path again.

Verification: call the new path URL with the real secret and confirm `tools/list` returns the four tools, and that a wrong secret returns 401.

## What you do afterwards

1. Publish.
2. In Claude, delete the failing connector and add a new one with the URL above (secret in the path, no query string), leaving both OAuth fields blank.

## If Claude still forces OAuth

Some connector builds insist on OAuth regardless of the server's response. If the path-secret URL still triggers registration, the remaining route is a real OAuth 2.1 server (managed auth server + a consent page in the app). That's a considerably larger build — I'd propose it as a separate plan rather than bundle it here.

## Trade-off

The full URL is the credential. Anyone holding it has read/write access to the vault, and paths appear in logs and history just like query strings. If it leaks, save a new `MCP_SHARED_SECRET` value and re-register the connector — no code change needed.

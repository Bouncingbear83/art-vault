# Make the Claude connector work: proper OAuth sign-in

## What's happening

The published endpoint is live and answers requests, so the server isn't the problem. Claude's web connector doesn't offer a bearer-token or header field — it insists on signing in to the app with OAuth, tries to register itself automatically, and fails because Art360 has no OAuth sign-in service for it to register with. That's the `ofid_...` error. Secret-in-the-URL can't fix this, because Claude never gets far enough to call the URL.

## The fix

Give Art360 a real sign-in service for connectors, and rebuild the MCP server on the supported Lovable MCP framework so Claude can connect the normal way: you click connect, a consent screen appears, you approve as bertbroadead@gmail.com, and Claude's tools then act as you.

1. Turn on the app's OAuth sign-in service so Claude can register itself automatically.
2. Add a consent screen at `/.lovable/oauth/consent` that shows which app is connecting and offers Approve / Deny. If you aren't signed in, it sends you through the existing magic-link flow and returns you to the same consent screen.
3. Rebuild the four existing tools (`create_note`, `search_notes`, `update_flag`, `get_artist360`) on the supported framework, keeping their behaviour and validation identical.
4. Serve them at `https://canvas-verdict.lovable.app/mcp`, verifying your signed-in identity on every call.
5. Remove the two hand-written endpoints and the URL-secret scheme they relied on.
6. Publish, then in Claude delete the failing connector and add a new one pointing at `/mcp` with both OAuth fields left blank.

## Security change worth knowing

Today the MCP path uses the service key, which bypasses all row-level security. After this change tools run as the signed-in user, so your existing vault rules apply to Claude exactly as they do in the browser. Only bertbroadead@gmail.com can read or write.

## Technical notes

- `bun add @lovable.dev/mcp-js zod`, add the package to `minimumReleaseAgeExcludes` in `bunfig.toml`, add `mcpPlugin()` to `vite.config.ts`.
- Tools under `src/lib/mcp/tools/`, entry `src/lib/mcp/index.ts` with `auth.oauth.issuer({ issuer: https://<project-ref>.supabase.co/auth/v1, acceptedAudiences: "authenticated" })`.
- Shared Supabase factory `src/lib/mcp/supabase.ts` using `supabaseForUser(ctx)` (bearer forwarded, RLS as the user). No service-role key anywhere in `src/lib/mcp/`.
- Run `supabase--configure_oauth_server` to activate the authorization server with dynamic client registration.
- Consent route file must be exactly `src/routes/[.]lovable.oauth.consent.tsx`, `ssr: false`, preserving the return URL through the magic-link flow.
- Delete `src/routes/api/public/mcp.ts`, `src/routes/api/public/mcp.$key.ts`, `src/lib/mcp-core.server.ts`; `MCP_SHARED_SECRET` becomes unused.

// RFC 9728 path-inserted form: /.well-known/oauth-protected-resource/mcp
// Some MCP clients (Claude) only probe this variant; without it they fall back
// to treating the app origin as the authorization server and fail to register.
import { createFileRoute } from "@tanstack/react-router";

import { createTanStackOAuthProtectedResourceMetadataHandler } from "@lovable.dev/mcp-js/stacks/tanstack";

import mcp from "../../lib/mcp/index";

export const Route = createFileRoute("/.well-known/oauth-protected-resource/mcp")({
  server: {
    handlers: {
      ANY: createTanStackOAuthProtectedResourceMetadataHandler(mcp, {
        resourcePath: "/mcp",
        metadataPath: "/.well-known/oauth-protected-resource",
        trustForwardedHost: true,
      }),
    },
  },
});

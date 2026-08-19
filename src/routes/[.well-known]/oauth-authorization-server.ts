// Some MCP clients probe the resource origin for authorization-server metadata
// instead of following the protected-resource document. Redirect them to the
// real issuer so their registration step succeeds.
import { createFileRoute } from "@tanstack/react-router";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";
const target = `https://${projectRef}.supabase.co/auth/v1/.well-known/oauth-authorization-server`;

export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
  server: {
    handlers: {
      ANY: () => Response.redirect(target, 302),
    },
  },
});

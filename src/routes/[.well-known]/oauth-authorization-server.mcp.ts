// Path-inserted variant: /.well-known/oauth-authorization-server/mcp
import { createFileRoute } from "@tanstack/react-router";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";
const target = `https://${projectRef}.supabase.co/auth/v1/.well-known/oauth-authorization-server`;

export const Route = createFileRoute("/.well-known/oauth-authorization-server/mcp")({
  server: {
    handlers: {
      ANY: () => Response.redirect(target, 302),
    },
  },
});

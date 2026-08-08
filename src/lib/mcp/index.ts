import { auth, defineMcp } from "@lovable.dev/mcp-js";
import type { AnyToolDefinition } from "@lovable.dev/mcp-js";
import createNote from "./tools/create-note";
import searchNotes from "./tools/search-notes";
import updateFlag from "./tools/update-flag";
import getArtist360 from "./tools/get-artist360";

// `exactOptionalPropertyTypes` makes the SDK's tool type reject an absent
// `outputSchema`; these tools return text content only.
const tools = [createNote, searchNotes, updateFlag, getArtist360] as unknown as AnyToolDefinition[];

// Issuer must be the direct Supabase host (the published proxy URL fails RFC 8414 issuer match).
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "art-vault",
  title: "Art Vault",
  version: "1.0.0",
  instructions:
    "Tools for the Art360 research vault: create and search notes, update flags, and read the artist_360 surface. All calls act as the signed-in vault owner.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [createNote, searchNotes, updateFlag, getArtist360],
});

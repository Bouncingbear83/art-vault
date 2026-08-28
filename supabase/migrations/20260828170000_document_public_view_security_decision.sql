-- 20260828170000_document_public_view_security_decision.sql
--
-- Documentation only. No schema, RLS, grant or view-body change. Verified:
-- COMMENT ON VIEW does not alter pg_get_viewdef output or reloptions, so this
-- migration cannot move any parity_check.sql fingerprint. Confirmed on the
-- rebuild before writing this file.
--
-- Decision (2026-08-28): artist_360 and book_screen stay security_invoker=off.
-- They run with the view owner's rights and are readable by anon without any
-- RLS policy on the tables underneath, which is why the deployed Book surface
-- works for a logged-out visitor today.
--
-- The alternative (security_invoker=on, plus a genuine anon SELECT policy on
-- artists, comps and notes) was evaluated and rejected. Both views join notes
-- to count open flags per artist:
--
--   LEFT JOIN (SELECT artist_id, count(*) AS open_flags FROM notes
--              WHERE note_type='Flag' AND action_status='Open'
--              GROUP BY artist_id) f ON f.artist_id = a.artist_id
--
-- RLS is a table-level, row-level filter, not a per-view scope. Opening notes
-- to anon so the view can count flags means anon can also SELECT * FROM notes
-- directly over the Supabase REST API using the anon key, which ships in the
-- frontend bundle. Verified on the rebuild: with USING (true) on notes for
-- anon, a raw query returned full vault note bodies, i.e. verdict rationale
-- and walk-away figures, not just a count. That is strictly more exposure
-- than the current owner-rights view gives, for no gain: the view already
-- shows what a logged-out visitor is meant to see.
--
-- Single collector, single user: the practical difference between "public"
-- and "gated" is nil today, so the owner-rights pattern stands rather than
-- opening notes wholesale to satisfy RLS literalism. Revisit if a second
-- reader is ever added, or if notes content changes character.
--
-- Re-running is a no-op.

COMMENT ON VIEW public.artist_360 IS
  'security_invoker intentionally off: anon-readable by design (single-user Book '
  'surface). Do not add an anon RLS policy on artists/comps/notes to "fix" this; '
  'notes carries vault verdict text and would go fully public over REST. See '
  '20260828170000_document_public_view_security_decision.sql.';

COMMENT ON VIEW public.book_screen IS
  'security_invoker intentionally off: anon-readable by design (single-user Book '
  'surface). Do not add an anon RLS policy on artists/comps/notes to "fix" this; '
  'notes carries vault verdict text and would go fully public over REST. See '
  '20260828170000_document_public_view_security_decision.sql.';

-- 20260825090000_extend_book_screen_decision_fields.sql
--
-- WHY: The Book (book_screen) rendered only the oil-arbitrage DISPLAY fields
-- (median_uk_hammer_gbp, exit_vs_regional_spread) and hid every gate field that
-- actually decides a lane. This exposes the decision-grade fields already computed
-- in comps_rollup so the roster surface can sort / filter / RAG on real edge.
--
-- METHOD: DROP + CREATE (not CREATE OR REPLACE) because we reorder columns.
-- CREATE OR REPLACE can only append, and would fail on "cannot change name of
-- view column". book_screen is a leaf presentation view; nothing depends on it,
-- so DROP is clean. No CASCADE on purpose: if the DROP errors, a dependant exists
-- and you want to see it, not silently destroy it.
--
-- BACK-COMPAT: every column the current frontend reads is retained under the same
-- name, so named-column consumers keep working; only new columns are added.
--
-- ASSUMPTION TO CONFIRM ONCE: the live book_screen selects all `artists` rows with
-- no tracked-only WHERE filter (e.g. excluding parked discovery names). Verify with
--   SELECT pg_get_viewdef('public.book_screen', true);
-- If it filters, re-add that WHERE clause at the bottom before running.

DROP VIEW IF EXISTS public.book_screen;

CREATE VIEW public.book_screen WITH (security_invoker = on) AS
SELECT
  -- identity / dimensions (from artists)
  a.artist_id,
  a.display_name,
  a.dates,
  a.play_type,
  a.tier,
  a.arr_status,
  a.palette_pref,
  a.paper_sleeve,                 -- switches the governing-number logic in the UI

  -- decision-grade gate fields (previously hidden; the whole point of this migration)
  c.buy_edge_flag,               -- Real / Thin / None  (oil-arbitrage lane only)
  c.median_realisation,          -- in-zone UK oil realisation: the "is there discount" read
  c.buy_regional_realisation,    -- tier-independent regional realisation (§H leg 2)
  c.matched_spread,              -- size-band-controlled spread (§H leg 3); NULL = control failed
  c.spread_trusted,              -- passes n-gate AND survives matched control
  c.thin_exit_flag,              -- exit_strong_n < 8  (§H leg 1 fail => WATCH, not BUY)
  c.data_confidence,             -- High / Med / Low
  c.sell_through_pct,

  -- retained display fields (still shown, now clearly secondary)
  c.median_uk_hammer_gbp,        -- autograph-OIL median: category error for paper_sleeve names
  c.exit_vs_regional_spread,     -- DISPLAY only, never a trigger (the mirage column)
  c.level_read,
  c.n_exit_strong,
  c.n_buy_regional,
  c.updated_at AS comps_updated_at,   -- proxy freshness; true verdict valid_to join is a later step

  -- open flags (Flag notes still Open, artist-scoped)
  coalesce(f.open_flags, 0)::int AS open_flags
FROM public.artists a
LEFT JOIN public.comps_rollup c
  ON c.artist_id = a.artist_id
LEFT JOIN (
  SELECT artist_id, count(*) AS open_flags
  FROM public.notes
  WHERE note_type = 'Flag'
    AND action_status = 'Open'
  GROUP BY artist_id
) f ON f.artist_id = a.artist_id;

GRANT SELECT ON public.book_screen TO authenticated;
GRANT ALL    ON public.book_screen TO service_role;

-- Spot-check after apply:
--   SELECT display_name, play_type, buy_edge_flag, median_realisation,
--          buy_regional_realisation, thin_exit_flag, paper_sleeve
--   FROM public.book_screen ORDER BY display_name;
-- Expect Kay + Cooke: buy_edge_flag='Real', thin_exit_flag=false.
-- Expect Roberts/Melville/Wyld: paper_sleeve=true (median_uk_hammer_gbp is oil, ignore in UI).

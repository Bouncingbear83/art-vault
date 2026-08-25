-- The Book reads artist_360, which only forwarded a subset of comps_rollup.
-- It surfaced arb_edge_raw (aliased exit_vs_regional_spread): the RAW, uncontrolled
-- cross-tier ratio the grain work proved is a mirage (David Roberts 25.68x).
-- This rebuilds the view to also forward the six honest fields the rollup already
-- computes, so the Book can lead with the three §H tests, not the contaminated ratio.
--
-- Uses DROP + CREATE, not CREATE OR REPLACE: the live view's column order is ahead
-- of the last repo migration (Lovable added arb_read, buy_regional_realisation,
-- n_buy_regional, n_exit_strong, spread_trusted in an order we cannot see), and
-- CREATE OR REPLACE forbids reordering existing columns. DROP + CREATE is safe here:
-- artist_360 is a leaf presentation view; nothing else in the schema reads FROM it.
-- Wrapped in a transaction so a failed CREATE rolls the DROP back and the view is
-- never left missing. Column order is cosmetic; the client selects by name.

BEGIN;

DROP VIEW IF EXISTS public.artist_360;

CREATE VIEW public.artist_360 WITH (security_invoker = on) AS
SELECT
  -- identity / roster metadata (artists)
  a.artist_id,
  a.display_name,
  a.dates,
  a.tier,
  a.arr_status,
  a.play_type,
  a.palette_pref,
  -- headline oil grain (comps_rollup): autograph oil, UK
  c.median_uk_hammer_gbp,
  c.sell_through_pct,
  c.n_uk_auto_oil,
  c.data_confidence,
  -- §H test 2: is there room (tier-independent + subject-gated)
  c.buy_regional_realisation,
  c.in_zone_realisation,
  c.median_realisation,          -- ADDED
  -- §H test 1: exit anchor depth
  c.n_exit_strong,
  c.n_buy_regional,
  c.thin_exit_flag,              -- ADDED
  c.spread_trusted,
  -- §H test 3: size-matched spread (the honest one) + the raw ratio it replaces
  c.matched_spread,             -- ADDED
  c.matched_n,                  -- ADDED
  c.exit_vs_regional_spread,    -- retained (== arb_edge_raw); Book shows greyed as "uncontrolled"
  c.arb_edge_raw,               -- ADDED (explicit raw name)
  -- rollup's own verdict
  c.buy_edge_flag,              -- ADDED (Real / Thin / None)
  c.arb_read,
  -- open flags
  coalesce(f.open_flags, 0)::int AS open_flags
FROM public.artists a
LEFT JOIN public.comps_rollup c ON c.artist_id = a.artist_id
LEFT JOIN (
  SELECT artist_id, count(*) AS open_flags
  FROM public.notes
  WHERE note_type = 'Flag' AND action_status = 'Open'
  GROUP BY artist_id
) f ON f.artist_id = a.artist_id;

GRANT SELECT ON public.artist_360 TO authenticated;
GRANT ALL ON public.artist_360 TO service_role;

COMMIT;

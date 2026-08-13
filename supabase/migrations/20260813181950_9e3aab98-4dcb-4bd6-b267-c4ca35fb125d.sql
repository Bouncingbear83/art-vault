CREATE OR REPLACE VIEW public.artist_360 WITH (security_invoker = on) AS
SELECT
  a.artist_id,
  a.display_name,
  a.dates,
  a.tier,
  a.arr_status,
  a.play_type,
  a.palette_pref,
  c.median_uk_hammer_gbp,
  c.exit_vs_regional_spread,
  c.in_zone_realisation,
  c.sell_through_pct,
  c.n_uk_auto_oil,
  c.data_confidence,
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
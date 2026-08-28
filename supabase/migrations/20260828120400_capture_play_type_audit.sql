-- 20260828120400_capture_play_type_audit.sql
--
-- Parity capture. Written from live catalogue output on 2026-08-28, not from
-- documentation and not from the schema baseline.
-- Source: pg_get_viewdef(oid, true). Carve-out list left inline exactly as live.

DROP VIEW IF EXISTS public.play_type_audit;

CREATE VIEW public.play_type_audit WITH (security_invoker = on) AS
 SELECT a.artist_id,
    a.display_name,
    a.play_type AS current_play,
        CASE
            WHEN NOT a.tracked THEN 'Untracked'::text
            WHEN a.paper_sleeve THEN 'Quality_hold'::text
            WHEN a.artist_id = ANY (ARRAY['edward-william-cooke'::text, 'edward-pritchett'::text]) THEN 'Quality_hold'::text
            WHEN COALESCE(c.n_uk_auto_oil, 0::bigint) < 8 OR c.median_uk_hammer_gbp IS NULL THEN 'Pending: no home lane'::text
            WHEN COALESCE(c.level_read, 'Unknown'::level_t) = 'Unknown'::level_t THEN 'Pending: not priceable'::text
            WHEN COALESCE(z.zone_fitness, 'Untestable'::text) = 'Untestable'::text AND COALESCE(c.n_uk_auto_oil, 0::bigint) < 12 THEN 'Pending: slice unmeasurable (thin body)'::text
            ELSE 'Quality_hold'::text
        END AS suggested_play,
    a.paper_sleeve,
    c.n_uk_auto_oil,
    c.median_uk_hammer_gbp,
    c.level_read,
    z.zone_fitness,
    z.zone_conf
   FROM artists a
     LEFT JOIN comps_rollup c ON c.artist_id = a.artist_id
     LEFT JOIN artist_zone_fitness z ON z.artist_id = a.artist_id
  WHERE a.tracked;

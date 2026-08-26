-- 20260826090000_collector_grammar_and_zone_capture.sql
--
-- Captures the 2026-08-26 collector-grammar session into the repo. Until now the
-- analytics layer (comps_rollup, artist_360, book_screen) existed only in the live
-- DB; a stale CREATE OR REPLACE could have wiped it. This migration makes the repo
-- able to re-apply the current state.
--
-- SCOPE CAVEAT: this is NOT a full schema baseline. It assumes the `comps` base
-- table and its columns already exist (hammer_equiv_gbp, in_zone, vtype_resolved,
-- est_mid_gbp, realisation, sale_date, medium_class, geo_resolved, authorship,
-- include_in_stats, status, artist_id). A clean-room rebuild still needs the
-- pg_dump --schema-only baseline (B4, separate). Run against the live DB it is
-- idempotent: CREATE OR REPLACE views, IF NOT EXISTS column, no-op UPDATEs on re-run.
--
-- What this session changed, in dependency order:
--   1. artists.tracked column (roster membership = has an Artist-scope Verdict)
--   2. re-scope of 9 discovery-era verdicts Portfolio -> Artist (+ artist_id backfill)
--   3. play_type Arbitrage -> Quality_hold (v7.2 retired the arbitrage frame)
--   4. comps_rollup: arb read kill-switched; collector columns computed
--      (level_read, price_cagr_5y/full, sell_through_trend, ceiling_breach);
--      matched_spread / trend_read intentionally NOT surfaced (leg 3 unbuilt;
--      time-trend mix-confounded and timing falsified)
--   5. artist_zone_fitness: per-name zone premium (zones = taste + thin liquidity,
--      applied per-name, not book-wide)
--   6. book_screen / artist_360: collector columns + zone join; book_screen
--      tracked-filtered

-- ---------------------------------------------------------------------------
-- 1. tracked column
-- ---------------------------------------------------------------------------
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS tracked boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. re-scope discovery-era verdicts (Portfolio, null artist_id) -> Artist.
--    Idempotent: after first run these are already Artist-scope with artist_id
--    set, so the WHERE matches nothing on replay.
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT note_id, entity_key,
    row_number() OVER (PARTITION BY entity_key ORDER BY slug DESC) AS rn
  FROM public.notes
  WHERE artist_id IS NULL
    AND scope     = 'Portfolio'::note_scope_t
    AND note_type = 'Verdict'::note_type_t
    AND entity_key IN ('bernard-ninnes','dorothea-sharp','emma-ciardi','frederick-goodall',
                       'john-macwhirter','sophie-anderson','william-james-muller',
                       'william-kay-blacklock','wynford-dewhurst')
)
UPDATE public.notes n
SET scope         = CASE WHEN r.rn = 1 THEN 'Artist'::note_scope_t      ELSE n.scope END,
    artist_id     = CASE WHEN r.rn = 1 THEN n.entity_key                 ELSE n.artist_id END,
    action_status = CASE WHEN r.rn > 1 THEN 'Superseded'::action_status_t ELSE n.action_status END
FROM ranked r
WHERE n.note_id = r.note_id;

-- ---------------------------------------------------------------------------
-- 3. tracked = has an Artist-scope Verdict; play_type Arbitrage -> Quality_hold
-- ---------------------------------------------------------------------------
UPDATE public.artists a SET tracked = true
WHERE EXISTS (SELECT 1 FROM public.notes n
             WHERE n.artist_id = a.artist_id
               AND n.note_type = 'Verdict'::note_type_t
               AND n.scope     = 'Artist'::note_scope_t);

UPDATE public.artists SET play_type = 'Quality_hold'::play_type_t
WHERE play_type = 'Arbitrage'::play_type_t;

-- ---------------------------------------------------------------------------
-- 4. comps_rollup (arb read kill-switched; collector grammar computed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.comps_rollup WITH (security_invoker = on) AS
 WITH agg AS (
         SELECT comps.artist_id,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY (comps.hammer_equiv_gbp::double precision)) FILTER (WHERE comps.medium_class='Oil' AND comps.geo_resolved='UK' AND comps.status='Sold' AND comps.hammer_equiv_gbp IS NOT NULL)::numeric AS median_uk_hammer_gbp,
            count(*) FILTER (WHERE comps.medium_class='Oil' AND comps.vtype_resolved='Exit_Strong' AND comps.status='Sold' AND comps.hammer_equiv_gbp > 0) AS n_exit_strong,
            count(*) FILTER (WHERE comps.medium_class='Oil' AND comps.vtype_resolved='Buy_Regional' AND comps.status='Sold' AND comps.hammer_equiv_gbp > 0) AS n_buy_regional,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY (comps.hammer_equiv_gbp::double precision)) FILTER (WHERE comps.medium_class='Oil' AND comps.in_zone='In' AND comps.vtype_resolved='Exit_Strong' AND comps.status='Sold' AND comps.hammer_equiv_gbp IS NOT NULL)::numeric AS exit_median,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY (comps.hammer_equiv_gbp::double precision)) FILTER (WHERE comps.medium_class='Oil' AND comps.in_zone='In' AND comps.vtype_resolved='Buy_Regional' AND comps.status='Sold' AND comps.hammer_equiv_gbp IS NOT NULL)::numeric AS regional_median,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY (comps.realisation::double precision)) FILTER (WHERE comps.medium_class='Oil' AND comps.in_zone='In' AND comps.vtype_resolved='Buy_Regional' AND comps.status='Sold' AND comps.est_mid_gbp >= 200 AND comps.realisation IS NOT NULL)::numeric AS buy_regional_realisation,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY (comps.realisation::double precision)) FILTER (WHERE comps.medium_class='Oil' AND comps.in_zone='In' AND comps.geo_resolved='UK' AND comps.status='Sold' AND comps.est_mid_gbp >= 200 AND comps.realisation IS NOT NULL)::numeric AS in_zone_realisation,
            count(*) FILTER (WHERE comps.medium_class='Oil' AND comps.geo_resolved='UK' AND comps.status='Sold') AS sold_uk,
            count(*) FILTER (WHERE comps.medium_class='Oil' AND comps.geo_resolved='UK' AND comps.status='Not_Sold') AS ns_uk
           FROM comps
          WHERE comps.authorship='Autograph' AND comps.include_in_stats='Y'
          GROUP BY comps.artist_id
        ),
      base AS (
         SELECT artist_id, hammer_equiv_gbp::numeric AS h, sale_date, status,
                EXTRACT(YEAR FROM sale_date)::int AS yr
           FROM comps
          WHERE authorship='Autograph' AND include_in_stats='Y'
            AND medium_class='Oil' AND geo_resolved='UK'
        ),
      win AS (
         SELECT artist_id,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY h) FILTER (WHERE status='Sold' AND sale_date >= CURRENT_DATE - INTERVAL '36 months')::numeric AS med_recent,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY h) FILTER (WHERE status='Sold' AND sale_date < CURRENT_DATE - INTERVAL '36 months' AND sale_date >= CURRENT_DATE - INTERVAL '72 months')::numeric AS med_prior,
            count(*) FILTER (WHERE status='Sold' AND sale_date >= CURRENT_DATE - INTERVAL '36 months') AS n_recent,
            count(*) FILTER (WHERE status='Sold' AND sale_date < CURRENT_DATE - INTERVAL '36 months' AND sale_date >= CURRENT_DATE - INTERVAL '72 months') AS n_prior,
            count(*) FILTER (WHERE status='Sold' AND sale_date >= CURRENT_DATE - INTERVAL '36 months') AS s_rec,
            count(*) FILTER (WHERE status IN ('Sold','Not_Sold') AND sale_date >= CURRENT_DATE - INTERVAL '36 months') AS off_rec,
            count(*) FILTER (WHERE status='Sold' AND sale_date < CURRENT_DATE - INTERVAL '36 months' AND sale_date >= CURRENT_DATE - INTERVAL '72 months') AS s_pri,
            count(*) FILTER (WHERE status IN ('Sold','Not_Sold') AND sale_date < CURRENT_DATE - INTERVAL '36 months' AND sale_date >= CURRENT_DATE - INTERVAL '72 months') AS off_pri
           FROM base GROUP BY artist_id
        ),
      lvl AS (
         SELECT artist_id,
            percentile_cont(0.25) WITHIN GROUP (ORDER BY h) FILTER (WHERE status='Sold' AND h > 0)::numeric AS q1,
            percentile_cont(0.75) WITHIN GROUP (ORDER BY h) FILTER (WHERE status='Sold' AND h > 0)::numeric AS q3,
            count(*) FILTER (WHERE status='Sold' AND h > 0) AS n_sold,
            max(h) FILTER (WHERE status='Sold') AS max_h
           FROM base GROUP BY artist_id
        ),
      yearly AS (
         SELECT artist_id, yr,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY h)::numeric AS ymed,
            count(*) AS yn
           FROM base WHERE status='Sold' AND h > 0
          GROUP BY artist_id, yr
        ),
      yearly2 AS (
         SELECT y.*, max(yr) OVER (PARTITION BY artist_id) AS max_yr
           FROM yearly y
        ),
      cagr AS (
         SELECT artist_id,
            count(*) AS n_years, min(yn) AS min_yn, min(yr) AS y0, max(yr) AS y1,
            (array_agg(ymed ORDER BY yr))[1] AS med_first,
            (array_agg(ymed ORDER BY yr DESC))[1] AS med_last,
            count(*) FILTER (WHERE yr >= max_yr - 4) AS n_years5,
            min(yn) FILTER (WHERE yr >= max_yr - 4) AS min_yn5,
            min(yr) FILTER (WHERE yr >= max_yr - 4) AS y0_5,
            max(yr) FILTER (WHERE yr >= max_yr - 4) AS y1_5,
            (array_agg(ymed ORDER BY yr) FILTER (WHERE yr >= max_yr - 4))[1] AS med_first5,
            (array_agg(ymed ORDER BY yr DESC) FILTER (WHERE yr >= max_yr - 4))[1] AS med_last5
           FROM yearly2 GROUP BY artist_id
        )
 SELECT a.artist_id,
    round(a.median_uk_hammer_gbp) AS median_uk_hammer_gbp,
    round(a.exit_median / NULLIF(a.regional_median, 0), 2) AS exit_vs_regional_spread,
    round(a.exit_median / NULLIF(a.regional_median, 0), 2) AS arb_edge_raw,
    a.n_exit_strong,
    a.n_exit_strong AS exit_strong_n,
    a.n_buy_regional,
    a.n_exit_strong + a.n_buy_regional AS n_uk_auto_oil,
    round(a.buy_regional_realisation, 2) AS buy_regional_realisation,
    round(a.in_zone_realisation, 2) AS in_zone_realisation,
    round(a.in_zone_realisation, 2) AS median_realisation,
        CASE WHEN (a.sold_uk + a.ns_uk) > 0 THEN round(100.0 * a.sold_uk::numeric / (a.sold_uk + a.ns_uk)) ELSE NULL END AS sell_through_pct,
    false AS spread_trusted,
    a.n_exit_strong < 8 AS thin_exit_flag,
        CASE WHEN a.n_exit_strong >= 8 AND a.n_buy_regional >= 8 THEN 'High'
             WHEN a.n_buy_regional >= 5 THEN 'Med' ELSE 'Low' END::confidence_t AS data_confidence,
        CASE WHEN a.n_exit_strong < 8 THEN 'WATCH' ELSE 'SELECTIVE' END AS arb_read,
        CASE WHEN a.n_exit_strong >= 8 AND a.buy_regional_realisation < 1 THEN 'Unconfirmed'
             WHEN a.buy_regional_realisation < 1 THEN 'Thin' ELSE 'None' END AS buy_edge_flag,
        CASE WHEN l.n_sold < 8 OR w.n_recent < 3 OR w.med_recent IS NULL THEN 'Unknown'
             WHEN w.med_recent < l.q1 THEN 'Cheap'
             WHEN w.med_recent > l.q3 THEN 'Rich'
             ELSE 'Fair' END::level_t AS level_read,
        CASE WHEN w.n_recent < 5 OR w.n_prior < 5 OR w.med_prior IS NULL OR w.med_prior = 0 THEN 'Unknown'
             WHEN w.med_recent / w.med_prior >= 1.15 THEN 'Up'
             WHEN w.med_recent / w.med_prior <= 0.87 THEN 'Down'
             ELSE 'Flat' END::trend_t AS trend_read,
        CASE WHEN c.n_years5 >= 3 AND c.min_yn5 >= 3 AND c.y1_5 > c.y0_5 AND c.med_first5 > 0
             THEN round((power(c.med_last5 / c.med_first5, 1.0 / (c.y1_5 - c.y0_5)) - 1)::numeric, 4) END AS price_cagr_5y,
        CASE WHEN c.n_years >= 4 AND c.min_yn >= 3 AND c.y1 > c.y0 AND c.med_first > 0
             THEN round((power(c.med_last / c.med_first, 1.0 / (c.y1 - c.y0)) - 1)::numeric, 4) END AS price_cagr_full,
    NULL::text AS anchor_id,
    NULL::numeric AS vs_anchor_ratio,
    NULL::integer AS matched_n,
    NULL::numeric AS matched_spread,
        CASE WHEN w.off_rec < 5 OR w.off_pri < 5 OR w.off_pri = 0 THEN NULL
             WHEN (w.s_rec::numeric / w.off_rec) - (w.s_pri::numeric / w.off_pri) >= 0.10 THEN 'Up'
             WHEN (w.s_rec::numeric / w.off_rec) - (w.s_pri::numeric / w.off_pri) <= -0.10 THEN 'Down'
             ELSE 'Flat' END AS sell_through_trend,
    now() AS updated_at,
    (l.max_h > 10000) AS ceiling_breach
   FROM agg a
   LEFT JOIN win  w ON w.artist_id = a.artist_id
   LEFT JOIN lvl  l ON l.artist_id = a.artist_id
   LEFT JOIN cagr c ON c.artist_id = a.artist_id;

-- ---------------------------------------------------------------------------
-- 5. artist_zone_fitness (per-name zone premium; taste + thin liquidity)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.artist_zone_fitness WITH (security_invoker = on) AS
WITH z AS (
  SELECT artist_id,
    count(*) FILTER (WHERE status='Sold' AND in_zone='In')  AS n_in,
    count(*) FILTER (WHERE status='Sold' AND in_zone<>'In') AS n_out,
    count(*) FILTER (WHERE status IN ('Sold','Not_Sold') AND in_zone='In')  AS off_in,
    count(*) FILTER (WHERE status IN ('Sold','Not_Sold') AND in_zone<>'In') AS off_out,
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY realisation) FILTER (WHERE status='Sold' AND in_zone='In'  AND est_mid_gbp>=200))::numeric AS real_in,
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY realisation) FILTER (WHERE status='Sold' AND in_zone<>'In' AND est_mid_gbp>=200))::numeric AS real_out
  FROM comps
  WHERE authorship='Autograph' AND include_in_stats='Y' AND medium_class='Oil' AND geo_resolved='UK'
  GROUP BY artist_id
),
p AS (
  SELECT artist_id, n_in, n_out,
    round(100.0*n_in::numeric/NULLIF(off_in,0))  AS st_in,
    round(100.0*n_out::numeric/NULLIF(off_out,0)) AS st_out,
    round(100.0*n_in::numeric/NULLIF(off_in,0) - 100.0*n_out::numeric/NULLIF(off_out,0), 1) AS st_premium_pp,
    round(real_in,2) AS real_in, round(real_out,2) AS real_out,
    round(real_in - real_out,2) AS real_premium
  FROM z
)
SELECT *,
  CASE WHEN n_in >= 10 AND n_out >= 10 THEN 'robust' ELSE 'thin' END AS zone_conf,
  CASE
    WHEN n_in < 5 OR n_out < 5                                            THEN 'Untestable'
    WHEN st_premium_pp >= 5  AND COALESCE(real_premium,0) >= 0            THEN 'Pays'
    WHEN st_premium_pp >= 5  AND COALESCE(real_premium,0) <  0            THEN 'Liquidity_only'
    WHEN st_premium_pp <  5  AND COALESCE(real_premium,0) >= 0.10         THEN 'Price_only'
    WHEN st_premium_pp <= -5                                              THEN 'Inverted'
    ELSE 'Neutral'
  END AS zone_fitness
FROM p;

-- ---------------------------------------------------------------------------
-- 6. book_screen (collector columns + zone join + tracked filter)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.book_screen WITH (security_invoker = on) AS
SELECT
  a.artist_id, a.display_name, a.dates, a.play_type, a.tier, a.arr_status, a.palette_pref, a.paper_sleeve,
  c.buy_edge_flag, c.median_realisation, c.buy_regional_realisation, c.matched_spread, c.spread_trusted,
  c.thin_exit_flag, c.data_confidence, c.sell_through_pct, c.median_uk_hammer_gbp, c.exit_vs_regional_spread,
  c.level_read, c.n_exit_strong, c.n_buy_regional, c.updated_at AS comps_updated_at,
  COALESCE(f.open_flags, 0)::integer AS open_flags,
  c.price_cagr_full,
  c.sell_through_trend,
  c.ceiling_breach,
  z.zone_fitness,
  z.zone_conf,
  z.st_premium_pp AS zone_sellthrough_premium_pp
FROM public.artists a
LEFT JOIN public.comps_rollup c ON c.artist_id = a.artist_id
LEFT JOIN public.artist_zone_fitness z ON z.artist_id = a.artist_id
LEFT JOIN (
  SELECT notes.artist_id, count(*) AS open_flags
  FROM public.notes
  WHERE notes.note_type = 'Flag'::note_type_t AND notes.action_status = 'Open'::action_status_t
  GROUP BY notes.artist_id
) f ON f.artist_id = a.artist_id
WHERE a.tracked;

-- ---------------------------------------------------------------------------
-- 7. artist_360 (collector columns + zone join; per-artist lookup, unfiltered)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.artist_360 WITH (security_invoker = on) AS
 SELECT a.artist_id, a.display_name, a.dates, a.tier, a.arr_status, a.play_type, a.palette_pref,
    c.median_uk_hammer_gbp, c.sell_through_pct, c.n_uk_auto_oil, c.data_confidence,
    c.buy_regional_realisation, c.in_zone_realisation, c.median_realisation,
    c.n_exit_strong, c.n_buy_regional, c.thin_exit_flag, c.spread_trusted,
    c.matched_spread, c.matched_n, c.exit_vs_regional_spread, c.arb_edge_raw,
    c.buy_edge_flag, c.arb_read,
    COALESCE(f.open_flags, 0::bigint)::integer AS open_flags,
    c.level_read,
    c.price_cagr_full,
    c.sell_through_trend,
    c.ceiling_breach,
    z.zone_fitness,
    z.zone_conf
   FROM artists a
     LEFT JOIN comps_rollup c ON c.artist_id = a.artist_id
     LEFT JOIN artist_zone_fitness z ON z.artist_id = a.artist_id
     LEFT JOIN ( SELECT notes.artist_id, count(*) AS open_flags
                 FROM notes
                 WHERE notes.note_type = 'Flag'::note_type_t AND notes.action_status = 'Open'::action_status_t
                 GROUP BY notes.artist_id) f ON f.artist_id = a.artist_id;

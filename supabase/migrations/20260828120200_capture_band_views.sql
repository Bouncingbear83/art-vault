-- 20260828120200_capture_band_views.sql
--
-- Parity capture. Written from live catalogue output on 2026-08-28, not from
-- documentation and not from the schema baseline.
-- Source: pg_get_viewdef(oid, true) and pg_class.reloptions. Bodies are the deparsed
-- live definitions verbatim. DROP then CREATE because CREATE OR REPLACE is append-only.
-- artist_buy_band is dropped first: it depends on desk_params_current.

DROP VIEW IF EXISTS public.artist_buy_band;

DROP VIEW IF EXISTS public.desk_params_current;

DROP VIEW IF EXISTS public.artist_size_band_medians;

CREATE VIEW public.desk_params_current AS
 SELECT params_id,
    effective_from,
    collector_discount_firm,
    collector_discount_stretch,
    stale_haircut,
    remote_haircut,
    bp_pct_default,
    vat_premium,
    arr_rate,
    n_gate,
    homogeneity_threshold,
    recency_cutoff,
    note,
    created_at,
    sleeve_ceiling_multiple,
    band_n_gate,
    band_factor_cap,
    band_floor_gbp
   FROM desk_params
  ORDER BY effective_from DESC
 LIMIT 1;

CREATE VIEW public.artist_size_band_medians WITH (security_invoker = on) AS
 WITH base AS (
         SELECT c.artist_id,
            c.longest_cm,
            c.hammer_equiv_gbp AS h,
            c.vtype_resolved,
            EXTRACT(year FROM c.sale_date)::integer AS yr
           FROM comps c
          WHERE c.authorship = 'Autograph'::text AND c.include_in_stats = 'Y'::text AND c.medium_class = 'Oil'::text AND c.status = 'Sold'::text AND c.in_zone = 'In'::text AND (c.vtype_resolved = ANY (ARRAY['Exit_Strong'::text, 'Straddle'::text, 'Buy_Regional'::text])) AND c.hammer_equiv_gbp IS NOT NULL AND c.hammer_equiv_gbp > 0::numeric AND c.longest_cm IS NOT NULL AND c.longest_cm > 0::numeric
        ), names AS (
         SELECT DISTINCT base.artist_id
           FROM base
          WHERE base.artist_id IS NOT NULL
        ), bandsdef AS (
         SELECT n.artist_id,
            d.band_label,
            d.lo,
            d.hi,
            d.sort_order
           FROM names n
             LEFT JOIN artist_desk_config a ON a.artist_id = n.artist_id
             JOIN size_band_defs d ON d.band_set = COALESCE(a.band_set, 'default'::text)
        ), scopes(tier_scope, tiers, scope_order) AS (
         VALUES ('Buy_Regional'::text,ARRAY['Buy_Regional'::text],1), ('Straddle'::text,ARRAY['Straddle'::text],2), ('Exit_Strong'::text,ARRAY['Exit_Strong'::text],3), ('Straddle_down'::text,ARRAY['Straddle'::text, 'Buy_Regional'::text],4), ('All_UK'::text,ARRAY['Exit_Strong'::text, 'Straddle'::text, 'Buy_Regional'::text],5)
        ), gate AS (
         SELECT COALESCE(( SELECT desk_params.band_n_gate
                   FROM desk_params
                  ORDER BY desk_params.effective_from DESC
                 LIMIT 1), 5) AS g
        ), cells AS (
         SELECT b.artist_id,
            b.band_label,
            b.lo AS band_lo,
            b.hi AS band_hi,
            b.sort_order,
            s.tier_scope,
            s.scope_order,
            count(r.h) AS n,
            round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (r.h::double precision))::numeric) AS median_gbp,
            round(percentile_cont(0.25::double precision) WITHIN GROUP (ORDER BY (r.h::double precision))::numeric) AS p25_gbp,
            round(percentile_cont(0.75::double precision) WITHIN GROUP (ORDER BY (r.h::double precision))::numeric) AS p75_gbp,
            round(min(r.h)) AS min_gbp,
            round(max(r.h)) AS max_gbp,
            count(r.h) FILTER (WHERE r.yr >= 2023) AS n_recent,
            round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (r.h::double precision)) FILTER (WHERE r.yr >= 2023)::numeric) AS median_recent_gbp,
            count(r.h) < (( SELECT gate.g
                   FROM gate)) AS thin
           FROM bandsdef b
             CROSS JOIN scopes s
             LEFT JOIN base r ON r.artist_id = b.artist_id AND r.longest_cm >= b.lo AND (b.hi IS NULL OR r.longest_cm < b.hi) AND (r.vtype_resolved = ANY (s.tiers))
          GROUP BY b.artist_id, b.band_label, b.lo, b.hi, b.sort_order, s.tier_scope, s.scope_order
        ), allcells AS (
         SELECT n.artist_id,
            'ALL'::text AS text,
            NULL::numeric AS "numeric",
            NULL::numeric AS "numeric",
            0 AS "?column?",
            s.tier_scope,
            s.scope_order,
            count(r.h) AS count,
            round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (r.h::double precision))::numeric) AS round,
            round(percentile_cont(0.25::double precision) WITHIN GROUP (ORDER BY (r.h::double precision))::numeric) AS round,
            round(percentile_cont(0.75::double precision) WITHIN GROUP (ORDER BY (r.h::double precision))::numeric) AS round,
            round(min(r.h)) AS round,
            round(max(r.h)) AS round,
            count(r.h) FILTER (WHERE r.yr >= 2023) AS count,
            round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (r.h::double precision)) FILTER (WHERE r.yr >= 2023)::numeric) AS round,
            count(r.h) < (( SELECT gate.g
                   FROM gate)) AS "?column?"
           FROM names n
             CROSS JOIN scopes s
             LEFT JOIN base r ON r.artist_id = n.artist_id AND (r.vtype_resolved = ANY (s.tiers))
          GROUP BY n.artist_id, s.tier_scope, s.scope_order
        )
 SELECT cells.artist_id,
    cells.band_label,
    cells.band_lo,
    cells.band_hi,
    cells.sort_order,
    cells.tier_scope,
    cells.scope_order,
    cells.n,
    cells.median_gbp,
    cells.p25_gbp,
    cells.p75_gbp,
    cells.min_gbp,
    cells.max_gbp,
    cells.n_recent,
    cells.median_recent_gbp,
    cells.thin
   FROM cells
UNION ALL
 SELECT allcells.artist_id,
    allcells.text AS band_label,
    allcells."numeric" AS band_lo,
    allcells.numeric_1 AS band_hi,
    allcells."?column?" AS sort_order,
    allcells.tier_scope,
    allcells.scope_order,
    allcells.count AS n,
    allcells.round AS median_gbp,
    allcells.round_1 AS p25_gbp,
    allcells.round_2 AS p75_gbp,
    allcells.round_3 AS min_gbp,
    allcells.round_4 AS max_gbp,
    allcells.count_1 AS n_recent,
    allcells.round_5 AS median_recent_gbp,
    allcells."?column?_1" AS thin
   FROM allcells allcells(artist_id, text, "numeric", numeric_1, "?column?", tier_scope, scope_order, count, round, round_1, round_2, round_3, round_4, count_1, round_5, "?column?_1");

CREATE VIEW public.artist_buy_band AS
 WITH thresholds AS (
         SELECT p.collector_discount_firm AS d_firm,
            p.bp_pct_default AS bp,
            p.vat_premium AS vat,
            p.arr_rate AS arr,
            p.n_gate,
            p.band_n_gate,
            p.recency_cutoff,
            p.band_floor_gbp,
            b.envelope_gbp,
            b.target_works,
            round(b.envelope_gbp / NULLIF(b.target_works, 0)::numeric / NULLIF(1::numeric - p.collector_discount_firm, 0::numeric), 0) AS band_ceiling_gbp
           FROM desk_params_current p
             CROSS JOIN budget b
          WHERE b.period_year = EXTRACT(year FROM CURRENT_DATE)::integer
        ), default_set AS (
         SELECT artist_desk_config.band_set
           FROM artist_desk_config
          WHERE artist_desk_config.band_set IS NOT NULL
          GROUP BY artist_desk_config.band_set
          ORDER BY (count(*)) DESC
         LIMIT 1
        ), banded AS (
         SELECT c.artist_id,
            b.band_label,
            b.sort_order,
            a.play_type,
            cfg.arr_active_until,
            c.hammer_equiv_gbp AS h,
            c.realisation,
            c.status,
            c.palette,
            EXTRACT(year FROM c.sale_date)::integer AS yr,
            cfg.palette_avoid IS NOT NULL AND (c.palette = ANY (cfg.palette_avoid)) AS pal_avoid
           FROM comps c
             LEFT JOIN artist_desk_config cfg ON cfg.artist_id = c.artist_id
             LEFT JOIN artists a ON a.artist_id = c.artist_id
             JOIN size_band_defs b ON b.band_set = COALESCE(cfg.band_set, ( SELECT default_set.band_set
                   FROM default_set)) AND c.longest_cm >= b.lo AND (b.hi IS NULL OR c.longest_cm < b.hi)
          WHERE c.authorship = 'Autograph'::text AND c.include_in_stats = 'Y'::text AND c.medium_class = 'Oil'::text AND c.in_zone = 'In'::text AND (c.vtype_resolved = ANY (ARRAY['Exit_Strong'::text, 'Straddle'::text, 'Buy_Regional'::text])) AND (c.status = ANY (ARRAY['Sold'::text, 'Not_Sold'::text])) AND c.longest_cm IS NOT NULL
        ), agg AS (
         SELECT g_1.artist_id,
            g_1.band_label,
            g_1.sort_order,
            g_1.play_type,
            g_1.arr_active_until,
            count(*) FILTER (WHERE NOT g_1.pal_avoid) AS n_offered,
            count(*) FILTER (WHERE NOT g_1.pal_avoid AND g_1.status = 'Sold'::text) AS n_sold,
            count(*) FILTER (WHERE NOT g_1.pal_avoid AND g_1.status = 'Not_Sold'::text) AS n_unsold,
            count(*) FILTER (WHERE g_1.pal_avoid) AS n_palette_excluded,
            count(*) FILTER (WHERE NOT g_1.pal_avoid AND g_1.status = 'Sold'::text AND g_1.yr >= t_1.recency_cutoff) AS n_sold_recent,
            round(100.0 * count(*) FILTER (WHERE NOT g_1.pal_avoid AND g_1.status = 'Sold'::text)::numeric / NULLIF(count(*) FILTER (WHERE NOT g_1.pal_avoid), 0)::numeric, 1) AS sell_through_pct,
            round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (
                CASE
                    WHEN NOT g_1.pal_avoid THEN g_1.h
                    ELSE NULL::numeric
                END::double precision))::numeric, 0) AS band_median_gbp,
            round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (
                CASE
                    WHEN NOT g_1.pal_avoid AND g_1.yr >= t_1.recency_cutoff THEN g_1.h
                    ELSE NULL::numeric
                END::double precision))::numeric, 0) AS recent_median_gbp,
            round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (
                CASE
                    WHEN NOT g_1.pal_avoid THEN g_1.realisation
                    ELSE NULL::numeric
                END::double precision))::numeric, 2) AS band_realisation
           FROM banded g_1
             CROSS JOIN thresholds t_1
          GROUP BY g_1.artist_id, g_1.band_label, g_1.sort_order, g_1.play_type, g_1.arr_active_until
        ), drift AS (
         SELECT agg.artist_id,
            agg.band_label,
            agg.sort_order,
            agg.play_type,
            agg.arr_active_until,
            agg.n_offered,
            agg.n_sold,
            agg.n_unsold,
            agg.n_palette_excluded,
            agg.n_sold_recent,
            agg.sell_through_pct,
            agg.band_median_gbp,
            agg.recent_median_gbp,
            agg.band_realisation,
            round(agg.recent_median_gbp / NULLIF(agg.band_median_gbp, 0::numeric), 2) AS recency_drift
           FROM agg
        )
 SELECT g.artist_id,
    g.band_label,
    g.sort_order,
    g.play_type,
    g.n_offered,
    g.n_sold,
    g.n_unsold,
    g.n_sold_recent,
    g.n_palette_excluded,
    g.sell_through_pct,
    g.band_median_gbp,
    g.recent_median_gbp,
    g.recency_drift,
    g.band_realisation,
    COALESCE(g.arr_active_until >= CURRENT_DATE, false) AS arr_live,
    round(1::numeric + t.bp * (1::numeric + t.vat) +
        CASE
            WHEN g.arr_active_until >= CURRENT_DATE THEN t.arr
            ELSE 0::numeric
        END, 4) AS k_buy,
        CASE
            WHEN g.n_sold_recent >= t.band_n_gate THEN round(g.recent_median_gbp * (1::numeric - t.d_firm) / (1::numeric + t.bp * (1::numeric + t.vat) +
            CASE
                WHEN g.arr_active_until >= CURRENT_DATE THEN t.arr
                ELSE 0::numeric
            END), 0)
            ELSE NULL::numeric
        END AS firm_hammer_gbp,
        CASE
            WHEN g.n_sold_recent >= t.band_n_gate THEN round(g.recent_median_gbp * (1::numeric - t.d_firm), 0)
            ELSE NULL::numeric
        END AS all_in_at_firm_gbp,
    t.band_floor_gbp,
    t.band_ceiling_gbp,
    t.recency_cutoff,
    t.band_n_gate,
        CASE
            WHEN g.n_offered = 0 THEN 'Palette_excluded'::text
            WHEN g.n_unsold = 0 THEN 'Survivorship_suspect'::text
            WHEN g.n_sold < t.n_gate THEN 'Untestable'::text
            WHEN g.n_sold_recent = 0 THEN 'No_recent_trade'::text
            WHEN g.n_sold_recent < t.band_n_gate THEN 'Thin_recent'::text
            WHEN g.recency_drift < 0.80 THEN 'Cooling'::text
            WHEN g.recent_median_gbp < t.band_floor_gbp THEN 'Dead_low'::text
            WHEN g.recent_median_gbp > t.band_ceiling_gbp THEN 'Out_of_envelope'::text
            ELSE 'Core'::text
        END AS band_verdict
   FROM drift g
     CROSS JOIN thresholds t;

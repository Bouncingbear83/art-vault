-- 20260901100000_capture_max_work_gbp_and_ratify_extension.sql
--
-- Parity capture. Someone extended the desk parameter ceiling and
-- ratify_desk_params directly on live between 2026-08-28 and 2026-09-01,
-- following the same pattern established in 20260828160000: a new trailing
-- optional parameter, NULL-means-carry-forward via COALESCE, a range check,
-- and SET search_path TO '' preserved on CREATE OR REPLACE. The six-argument
-- overload was correctly dropped before the seven-argument version was
-- created, avoiding the ambiguity documented in 20260828160000. Nothing here
-- is a fix; this migration only brings the repo into line with what live
-- already runs. Derived from information_schema.columns, pg_get_viewdef and
-- pg_get_functiondef against live on 2026-09-01.
--
-- New capability, not previously in the repo: max_work_gbp operationalises
-- the mandate's ~£10k per-work ceiling as a real desk_params lever rather
-- than a fixed comment, and artist_buy_band now joins budget on target_works
-- to compute per_work_budget_gbp and concentration_ratio, with a new
-- Ceiling_breach verdict state when a band's recent median clears the
-- per-work ceiling.

-- ---------------------------------------------------------------------------
-- 1. desk_params.max_work_gbp
-- ---------------------------------------------------------------------------
ALTER TABLE public.desk_params
  ADD COLUMN IF NOT EXISTS max_work_gbp numeric NOT NULL DEFAULT 10000;

-- ---------------------------------------------------------------------------
-- 2. desk_params_current and artist_buy_band, in dependency order.
--    artist_buy_band is dropped first: it selects from desk_params_current.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.artist_buy_band;

DROP VIEW IF EXISTS public.desk_params_current;

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
    band_floor_gbp,
    max_work_gbp
   FROM desk_params
  ORDER BY effective_from DESC
 LIMIT 1;

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
            p.max_work_gbp,
            b.envelope_gbp,
            b.target_works,
            round(b.envelope_gbp / NULLIF(b.target_works, 0)::numeric / NULLIF(1::numeric - p.collector_discount_firm, 0::numeric), 0) AS band_ceiling_gbp,
            round(b.envelope_gbp / NULLIF(b.target_works, 0)::numeric, 0) AS per_work_budget_gbp
           FROM desk_params_current p
             LEFT JOIN budget b ON b.period_year = EXTRACT(year FROM CURRENT_DATE)::integer
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
            b.hi AS band_hi,
            a.play_type,
            cfg.arr_active_until,
            cfg.min_longest_cm,
            c.hammer_equiv_gbp AS h,
            c.realisation,
            c.status,
            c.palette,
            EXTRACT(year FROM c.sale_date)::integer AS yr,
            cfg.palette_avoid IS NOT NULL AND (c.palette = ANY (cfg.palette_avoid)) AS pal_avoid,
            cfg.min_longest_cm IS NOT NULL AND c.longest_cm < cfg.min_longest_cm::numeric AS below_min,
            c.est_mid_gbp IS NOT NULL AND c.est_mid_gbp < 200::numeric AS low_value
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
            g_1.band_hi,
            g_1.play_type,
            g_1.arr_active_until,
            g_1.min_longest_cm,
            count(*) FILTER (WHERE NOT (g_1.pal_avoid OR g_1.below_min OR g_1.low_value)) AS n_offered,
            count(*) FILTER (WHERE NOT (g_1.pal_avoid OR g_1.below_min OR g_1.low_value) AND g_1.status = 'Sold'::text) AS n_sold,
            count(*) FILTER (WHERE NOT (g_1.pal_avoid OR g_1.below_min OR g_1.low_value) AND g_1.status = 'Not_Sold'::text) AS n_unsold,
            count(*) FILTER (WHERE g_1.pal_avoid) AS n_palette_excluded,
            count(*) FILTER (WHERE g_1.below_min AND NOT g_1.pal_avoid) AS n_below_min_excluded,
            count(*) FILTER (WHERE g_1.low_value AND NOT g_1.pal_avoid AND NOT g_1.below_min) AS n_low_value_excluded,
            count(*) FILTER (WHERE NOT (g_1.pal_avoid OR g_1.below_min OR g_1.low_value) AND g_1.status = 'Sold'::text AND g_1.yr >= t_1.recency_cutoff) AS n_sold_recent,
            round(100.0 * count(*) FILTER (WHERE NOT (g_1.pal_avoid OR g_1.below_min OR g_1.low_value) AND g_1.status = 'Sold'::text)::numeric / NULLIF(count(*) FILTER (WHERE NOT (g_1.pal_avoid OR g_1.below_min OR g_1.low_value)), 0)::numeric, 1) AS sell_through_pct,
            round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (
                CASE
                    WHEN NOT (g_1.pal_avoid OR g_1.below_min OR g_1.low_value) THEN g_1.h
                    ELSE NULL::numeric
                END::double precision))::numeric, 0) AS band_median_gbp,
            round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (
                CASE
                    WHEN NOT (g_1.pal_avoid OR g_1.below_min OR g_1.low_value) AND g_1.yr >= t_1.recency_cutoff THEN g_1.h
                    ELSE NULL::numeric
                END::double precision))::numeric, 0) AS recent_median_gbp,
            round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (
                CASE
                    WHEN NOT (g_1.pal_avoid OR g_1.below_min OR g_1.low_value) THEN g_1.realisation
                    ELSE NULL::numeric
                END::double precision))::numeric, 2) AS band_realisation
           FROM banded g_1
             CROSS JOIN thresholds t_1
          GROUP BY g_1.artist_id, g_1.band_label, g_1.sort_order, g_1.band_hi, g_1.play_type, g_1.arr_active_until, g_1.min_longest_cm
        ), drift AS (
         SELECT agg.artist_id,
            agg.band_label,
            agg.sort_order,
            agg.band_hi,
            agg.play_type,
            agg.arr_active_until,
            agg.min_longest_cm,
            agg.n_offered,
            agg.n_sold,
            agg.n_unsold,
            agg.n_palette_excluded,
            agg.n_below_min_excluded,
            agg.n_low_value_excluded,
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
            WHEN g.min_longest_cm IS NOT NULL AND g.band_hi IS NOT NULL AND g.band_hi <= g.min_longest_cm::numeric THEN 'Below_min_size'::text
            WHEN g.n_offered = 0 AND g.n_palette_excluded > 0 THEN 'Palette_excluded'::text
            WHEN g.n_offered = 0 THEN 'No_eligible_comps'::text
            WHEN g.n_unsold = 0 THEN 'Survivorship_suspect'::text
            WHEN g.n_sold < t.n_gate THEN 'Untestable'::text
            WHEN g.n_sold_recent = 0 THEN 'No_recent_trade'::text
            WHEN g.n_sold_recent < t.band_n_gate THEN 'Thin_recent'::text
            WHEN g.recency_drift < 0.80 THEN 'Cooling'::text
            WHEN g.recent_median_gbp < t.band_floor_gbp THEN 'Dead_low'::text
            WHEN (g.recent_median_gbp * (1::numeric - t.d_firm)) > t.max_work_gbp THEN 'Ceiling_breach'::text
            ELSE 'Core'::text
        END AS band_verdict,
    g.n_below_min_excluded,
    g.n_low_value_excluded,
    g.min_longest_cm,
    g.band_hi,
    t.max_work_gbp,
    t.per_work_budget_gbp,
        CASE
            WHEN g.n_sold_recent >= t.band_n_gate AND t.per_work_budget_gbp IS NOT NULL AND t.per_work_budget_gbp > 0::numeric THEN round(g.recent_median_gbp * (1::numeric - t.d_firm) / t.per_work_budget_gbp, 2)
            ELSE NULL::numeric
        END AS concentration_ratio
   FROM drift g
     CROSS JOIN thresholds t;

-- ---------------------------------------------------------------------------
-- 3. ratify_desk_params, seven-argument version. DROP the six-argument
--    overload first: leaving both in place reproduces the exact ambiguity
--    documented in 20260828160000, where a call using only the original
--    positional arguments becomes "not unique" once a second overload
--    exists.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ratify_desk_params(numeric, numeric, numeric, text, integer, numeric);

CREATE OR REPLACE FUNCTION public.ratify_desk_params(p_discount_firm numeric, p_discount_stretch numeric, p_band_floor_gbp numeric, p_note text, p_band_n_gate integer DEFAULT NULL::integer, p_band_factor_cap numeric DEFAULT NULL::numeric, p_max_work_gbp numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_new uuid;
BEGIN
  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RAISE EXCEPTION 'A rationale is required to ratify params.';
  END IF;
  IF p_discount_firm <= 0 OR p_discount_firm >= 1
     OR p_discount_stretch <= 0 OR p_discount_stretch >= 1 THEN
    RAISE EXCEPTION 'Discounts must sit strictly between 0 and 1.';
  END IF;
  IF p_discount_stretch >= p_discount_firm THEN
    RAISE EXCEPTION 'Stretch discount must be tighter than firm.';
  END IF;
  IF p_band_n_gate IS NOT NULL AND p_band_n_gate <= 0 THEN
    RAISE EXCEPTION 'band_n_gate must be a positive integer.';
  END IF;
  IF p_band_factor_cap IS NOT NULL AND p_band_factor_cap < 1 THEN
    RAISE EXCEPTION 'band_factor_cap must be at least 1.';
  END IF;
  IF p_max_work_gbp IS NOT NULL AND p_max_work_gbp <= 0 THEN
    RAISE EXCEPTION 'max_work_gbp must be positive.';
  END IF;

  INSERT INTO public.desk_params (
    effective_from, collector_discount_firm, collector_discount_stretch,
    stale_haircut, remote_haircut, bp_pct_default, vat_premium, arr_rate,
    n_gate, homogeneity_threshold, recency_cutoff,
    sleeve_ceiling_multiple, band_n_gate, band_factor_cap, band_floor_gbp,
    max_work_gbp, note)
  SELECT now(), p_discount_firm, p_discount_stretch,
    c.stale_haircut, c.remote_haircut, c.bp_pct_default, c.vat_premium, c.arr_rate,
    c.n_gate, c.homogeneity_threshold, c.recency_cutoff,
    c.sleeve_ceiling_multiple,
    COALESCE(p_band_n_gate, c.band_n_gate),
    COALESCE(p_band_factor_cap, c.band_factor_cap),
    p_band_floor_gbp,
    COALESCE(p_max_work_gbp, c.max_work_gbp),
    btrim(p_note)
  FROM public.desk_params_current c
  RETURNING params_id INTO v_new;

  RETURN v_new;
END $function$;

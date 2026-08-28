-- 20260828180000_move1_radar_ingest.sql
--
-- Move 1, forward-feed radar. Two changes, both ratified 2026-08-28:
--
-- 1. public.upcoming_lots: the radar's own staging table. Radar rows do NOT
--    enter public.lots at ingest. lots.sale_key is UNIQUE and a nightly upsert
--    would overwrite human-scored rows; the Deal Log is unfiltered by design
--    and machine Skips would drown the calibration surface; and scoreLot()
--    requires a boolean taste_ok, so writing to lots would force the radar to
--    invent the one gate that must stay human. This table therefore has NO
--    taste_ok, NO quality_delta_input, NO ladder_* and NO budget_ok column.
--    The absence is the guard: the radar cannot fabricate an input it has
--    nowhere to put. A row enters public.lots only at promotion, when a human
--    answers taste at the desk, carrying captured_by='radar' for provenance.
--
-- 2. artist_buy_band: apply the mandate's own size floor and the sub-£200
--    estimate exclusion (§E), degrade gracefully when no budget row exists for
--    the current year, and expose the new exclusion counts.

-- ===========================================================================
-- 1. upcoming_lots
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.upcoming_lots (
  sale_key                text PRIMARY KEY,

  -- provenance
  source                  text NOT NULL CHECK (source IN ('mutualart','thesaleroom','manual')),
  source_ref              text,
  lot_url                 text,
  image_url               text,
  first_seen_at           timestamptz NOT NULL DEFAULT now(),
  last_seen_at            timestamptz NOT NULL DEFAULT now(),

  -- identity. artist_id is NULL for off-roster / discovery names, which have no
  -- config and no comps and therefore cannot be scored or banded.
  artist_id               text REFERENCES public.artists(artist_id) ON DELETE CASCADE,
  artist_raw              text NOT NULL,
  title                   text NOT NULL,
  authorship              text NOT NULL DEFAULT 'Autograph',

  -- deterministic classification (endpoint, from score.ts helpers)
  medium_raw              text,
  medium_class            text,
  longest_cm              numeric,
  h_cm                    numeric,
  w_cm                    numeric,
  est_low                 numeric,
  est_high                numeric,
  currency                text,
  venue_raw               text,
  venue_canonical         text,
  vtype_resolved          text,
  geo_resolved            text,
  sale_date               date,

  -- LLM classification, subject and palette only, per-field confidence.
  -- palette_kw_only defaults TRUE: the radar reads titles, never images.
  subject                 text,
  subject_confidence      numeric CHECK (subject_confidence IS NULL OR (subject_confidence >= 0 AND subject_confidence <= 1)),
  palette                 text,
  palette_confidence      numeric CHECK (palette_confidence IS NULL OR (palette_confidence >= 0 AND palette_confidence <= 1)),
  palette_kw_only         boolean NOT NULL DEFAULT true,
  in_zone                 text CHECK (in_zone IN ('In','Skip')),
  classification_json     jsonb,

  -- screening read, from artist_buy_band. Band level only: median-quality,
  -- blended-tier, pre-taste. NOT a bid, and never rendered as one.
  band_label              text,
  band_verdict            text,
  band_firm_hammer_gbp    numeric,
  paper_ceiling_gbp       numeric,
  radar_lane              text NOT NULL DEFAULT 'quarantine'
                            CHECK (radar_lane IN ('candidate','watch','unclassified','suppressed','quarantine')),
  radar_rank              integer,
  radar_reason            text,
  scored_at               timestamptz,
  params_id               uuid,

  -- lifecycle
  promoted_lot_id         uuid REFERENCES public.lots(lot_id) ON DELETE SET NULL,
  promoted_at             timestamptz,
  dismissed_at            timestamptz,
  dismissed_reason        text,

  -- outcome capture. This is the survivorship fix: 47 of 115 bands read
  -- Survivorship_suspect because no unsold side was ever captured, and unsold
  -- data only exists if something was watching before the sale.
  outcome_status          text CHECK (outcome_status IN ('Sold','Not_Sold','Withdrawn','Results_NA')),
  outcome_hammer_native   numeric,
  outcome_currency        text,
  outcome_basis           text CHECK (outcome_basis IN ('Hammer','Inclusive')),
  outcome_captured_at     timestamptz,
  staged_batch            text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ===========================================================================
-- 2. indexes
-- ===========================================================================
CREATE INDEX IF NOT EXISTS upcoming_lane_idx
  ON public.upcoming_lots (radar_lane, sale_date);

CREATE INDEX IF NOT EXISTS upcoming_open_idx
  ON public.upcoming_lots (sale_date)
  WHERE promoted_lot_id IS NULL AND dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS upcoming_awaiting_outcome_idx
  ON public.upcoming_lots (sale_date)
  WHERE outcome_status IS NULL;

CREATE INDEX IF NOT EXISTS upcoming_artist_idx
  ON public.upcoming_lots (artist_id, sale_date);

-- ===========================================================================
-- 3. RLS, matching the dominant pattern on the other tables
-- ===========================================================================
ALTER TABLE public.upcoming_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_all_upcoming_lots ON public.upcoming_lots
  AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===========================================================================
-- 4. comments
-- ===========================================================================
COMMENT ON TABLE public.upcoming_lots IS
  'Forward-feed radar staging. Pre-taste candidates and their post-sale outcomes. Never a bid surface: it holds no taste_ok, no quality delta and no ladder. Rows graduate into public.lots only when a human answers the taste gate.';

COMMENT ON COLUMN public.upcoming_lots.sale_key IS
  'Same generator as lots.sale_key: slug(artist)|slug(title)|slug(venue_canonical)|ISO date. Keyed on the canonical venue, never the raw string, so the same lot from two sources dedupes.';

COMMENT ON COLUMN public.upcoming_lots.band_firm_hammer_gbp IS
  'artist_buy_band.firm_hammer_gbp for this (artist, band). Band-level, median-quality, blended across venue tiers. A screening level, not a walk-away: the walk-away comes from scoreLot at the desk after taste and quality delta.';

COMMENT ON COLUMN public.upcoming_lots.palette_kw_only IS
  'Always true for radar rows: palette is read from the title, never an image. The radar never asserts Grey, which is a hard skip; below the confidence threshold it ships Neutral and re-lanes to unclassified.';

COMMENT ON COLUMN public.upcoming_lots.outcome_status IS
  'Captured after the sale. Feeds comps_stage for corpus promotion and lots.result_hammer_gbp for Deal Log calibration. An unsold lot records Not_Sold, never null: null means no result yet.';

-- ===========================================================================
-- 5. artist_buy_band, replaced
-- ===========================================================================
CREATE OR REPLACE VIEW public.artist_buy_band AS
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
            WHEN t.band_ceiling_gbp IS NOT NULL AND g.recent_median_gbp > t.band_ceiling_gbp THEN 'Out_of_envelope'::text
            ELSE 'Core'::text
        END AS band_verdict,
    g.n_below_min_excluded,
    g.n_low_value_excluded,
    g.min_longest_cm,
    g.band_hi
   FROM drift g
     CROSS JOIN thresholds t;

COMMENT ON VIEW public.artist_buy_band IS
  'Per artist, per size band: is this cell live, and at what level. Screening only. The level pools Exit_Strong, Straddle and Buy_Regional, so it is a blended-tier median-quality number and must never be shown as a bid. Excludes palette_avoid, sizes below artist_desk_config.min_longest_cm and sub-£200 estimates (§E), each counted separately so an exclusion is visible rather than silent. band_ceiling_gbp is null when no budget row exists for the current year: the view degrades, it does not vanish.';

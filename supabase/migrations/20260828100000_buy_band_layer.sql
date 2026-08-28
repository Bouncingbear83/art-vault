-- ============================================================================
-- 20260828100000_buy_band_layer.sql
--
-- Captures the size-band buy-list layer built 2026-08-28. Every object here was
-- authored in that session, so these definitions are exact rather than
-- reverse-engineered.
--
-- NOT covered by this migration (definitions not yet read off live):
--   * size_band_defs seed rows and constraints  -- table shell only, see below
--   * artist_size_band_medians                  -- pre-existing view
--   * play_type_audit                           -- pre-existing view, inline
--                                                  carve-out list is repo debt
-- Tracked in vault flag 2026-08-28-schema-drift-inventory-01.
--
-- Idempotent throughout. Safe to run against live: the ADD COLUMN statements
-- are IF NOT EXISTS, and DROP VIEW IF EXISTS + CREATE VIEW is used rather than
-- CREATE OR REPLACE, which is append-only in Postgres and fires 42P16 on a
-- mid-list column insert.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. size_band_defs: table shell only
--
-- Columns and types verified against information_schema on 2026-08-28. The
-- primary key, any check constraints and the seeded band rows are NOT captured
-- here: a rebuild from repo would produce an empty table and every band join
-- would return zero rows. Complete this before relying on the repo to rebuild.
--
-- Canonical bands per mandate: <45 / 45-60 / 60-90 / 90+ cm. hi is null on the
-- top band (verified: the 90+ rows do join, so the open upper bound is null,
-- not a sentinel).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.size_band_defs (
  band_set    text    NOT NULL,
  band_label  text    NOT NULL,
  lo          numeric NOT NULL,
  hi          numeric,
  sort_order  integer NOT NULL,
  note        text
);


-- ---------------------------------------------------------------------------
-- 2. desk_params.band_floor_gbp
--
-- Below this recent median a band reads Dead_low: cheap, illiquid, no exit.
-- A judgement, not a derivation, which is why it is a parameter rather than a
-- constant buried in the view.
--
-- ADD COLUMN ... DEFAULT rather than a new desk_params row is deliberate.
-- desk_params is APPEND-NEVER-MUTATE and the standing hazard is that a new row
-- silently resets any value not explicitly copied forward; band_factor_cap was
-- reset to its default exactly this way. ADD COLUMN backfills every historic
-- row without writing one.
-- ---------------------------------------------------------------------------
ALTER TABLE public.desk_params
  ADD COLUMN IF NOT EXISTS band_floor_gbp numeric DEFAULT 2000;


-- ---------------------------------------------------------------------------
-- 3. budget.target_works
--
-- Number of works the envelope is intended to buy this year. Drives the band
-- ceiling: envelope / target_works / (1 - collector_discount_firm). Without it
-- the ceiling has to be hardcoded and goes stale the moment the envelope moves.
-- ---------------------------------------------------------------------------
ALTER TABLE public.budget
  ADD COLUMN IF NOT EXISTS target_works integer;


-- ---------------------------------------------------------------------------
-- 4. artist_desk_config.palette_avoid
--
-- Per-name palette exclusion. text[] rather than text because a name may need
-- more than one exclusion later; null for every name except where seeded, so
-- the default behaviour is unchanged.
--
-- This is the correct home for the gate. artists.palette_pref is single-valued
-- (32 Sunlit, 1 Moonlit as at 2026-08-28) and so cannot express an avoid rule:
-- filtering to palette = palette_pref would drop Neutral and unclassified rows
-- across the whole roster. palette_pref stays a display signal.
-- ---------------------------------------------------------------------------
ALTER TABLE public.artist_desk_config
  ADD COLUMN IF NOT EXISTS palette_avoid text[];

-- Olsson: Grey stays Avoid per mandate; Moonlit is his premium signature.
-- Seeded conditionally so the migration does not fail on a fresh DB with no
-- artist rows yet.
UPDATE public.artist_desk_config
SET palette_avoid = ARRAY['Grey']
WHERE artist_id = 'julius-olsson'
  AND palette_avoid IS DISTINCT FROM ARRAY['Grey'];


-- ---------------------------------------------------------------------------
-- 5. desk_params_current
--
-- Rebuilt to append band_floor_gbp. The view selects explicit columns rather
-- than *, so a new desk_params column is invisible to every consumer until this
-- is replaced. Column order preserved exactly as live; band_floor_gbp appended
-- last.
-- ---------------------------------------------------------------------------
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
       band_floor_gbp
FROM public.desk_params
ORDER BY effective_from DESC
LIMIT 1;


-- ---------------------------------------------------------------------------
-- 6. artist_buy_band
--
-- Converts the annual envelope into a defined buy list: per artist, per size
-- band, which bands are priceable and at what walk-away. Replaces the hand-set
-- per-name floors in the mandate appendix, which were set by eye in the arb era
-- and never re-derived after the collector pivot.
--
-- Three faults were found and fixed in successive versions of this view. Each
-- produced a confident buy list that was wrong, and the guards below are the
-- fixes. Do not soften them. Full write-up in vault Learning note
-- 2026-08-28-buy-band-design-lessons-01.
--
--   Fault 1, time-blindness. The first version blended 1998-2026 into one
--   median, so Brangwyn read Core on a band his own vault verdict calls
--   cooling. recency_cutoff existed in desk_params and was simply not wired.
--
--   Fault 2, gating on one statistic and pricing off another. The second
--   version gated on lifetime n_sold >= n_gate, then priced off the recent
--   median. Goodall 45-60 returned a recency drift of 13.05: a GBP 17,860
--   "median" off a single sale. Hence: firm_hammer_gbp and all_in_at_firm_gbp
--   return NULL unless n_sold_recent >= band_n_gate. Gate on the exact
--   statistic you price off.
--
--   Fault 3, silent fallback. COALESCE to the lifetime median where no recent
--   sales existed meant bands with ZERO recent trade read Core off pre-2023
--   evidence. Hence: No_recent_trade is an explicit verdict, never a fallback.
--
-- The verdict ladder is ordered and each branch is load-bearing:
--   Palette_excluded      whole band is an avoided palette (n_offered = 0);
--                         without this branch the row falls through to
--                         Untestable and reads as thin data, not deliberate
--                         exclusion
--   Survivorship_suspect  zero unsold captured; per mandate, never set a live
--                         walk-away on a name whose unsold side is invisible
--   Untestable            lifetime n below n_gate
--   No_recent_trade       nothing sold since recency_cutoff
--   Thin_recent           recent n below band_n_gate
--   Cooling               recent median below 0.80x the lifetime median
--   Dead_low              below band_floor_gbp
--   Out_of_envelope       above the derived ceiling
--   Core                  buyable
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.artist_buy_band;

CREATE VIEW public.artist_buy_band AS
WITH thresholds AS (
  SELECT p.collector_discount_firm AS d_firm,
         p.bp_pct_default          AS bp,
         p.vat_premium             AS vat,
         p.arr_rate                AS arr,
         p.n_gate,
         p.band_n_gate,
         p.recency_cutoff,
         p.band_floor_gbp,
         b.envelope_gbp,
         b.target_works,
         ROUND(((b.envelope_gbp / NULLIF(b.target_works, 0))
                / NULLIF(1 - p.collector_discount_firm, 0))::numeric, 0)
           AS band_ceiling_gbp
  FROM public.desk_params_current p
  CROSS JOIN public.budget b
  WHERE b.period_year = EXTRACT(year FROM CURRENT_DATE)::int
),
default_set AS (
  -- names with no config row still get banded, against the modal band_set
  SELECT band_set
  FROM public.artist_desk_config
  WHERE band_set IS NOT NULL
  GROUP BY band_set
  ORDER BY COUNT(*) DESC
  LIMIT 1
),
banded AS (
  SELECT c.artist_id,
         b.band_label,
         b.sort_order,
         a.play_type,
         cfg.arr_active_until,
         c.hammer_equiv_gbp AS h,
         c.realisation,
         c.status,
         c.palette,
         EXTRACT(year FROM c.sale_date)::int AS yr,
         (cfg.palette_avoid IS NOT NULL AND c.palette = ANY(cfg.palette_avoid))
           AS pal_avoid
  FROM public.comps c
  LEFT JOIN public.artist_desk_config cfg ON cfg.artist_id = c.artist_id
  LEFT JOIN public.artists a              ON a.artist_id   = c.artist_id
  JOIN public.size_band_defs b
    ON b.band_set = COALESCE(cfg.band_set, (SELECT band_set FROM default_set))
   AND c.longest_cm >= b.lo
   AND (b.hi IS NULL OR c.longest_cm < b.hi)
  -- in_zone is text 'In'/'Skip', NOT boolean; include_in_stats is text 'Y'/'N'
  WHERE c.authorship      = 'Autograph'
    AND c.include_in_stats = 'Y'
    AND c.medium_class    = 'Oil'
    AND c.in_zone         = 'In'
    AND c.vtype_resolved IN ('Exit_Strong', 'Straddle', 'Buy_Regional')
    AND c.status         IN ('Sold', 'Not_Sold')
    AND c.longest_cm IS NOT NULL
),
agg AS (
  SELECT g.artist_id,
         g.band_label,
         g.sort_order,
         g.play_type,
         g.arr_active_until,
         COUNT(*) FILTER (WHERE NOT pal_avoid)                       AS n_offered,
         COUNT(*) FILTER (WHERE NOT pal_avoid AND status = 'Sold')   AS n_sold,
         COUNT(*) FILTER (WHERE NOT pal_avoid AND status = 'Not_Sold') AS n_unsold,
         COUNT(*) FILTER (WHERE pal_avoid)                           AS n_palette_excluded,
         COUNT(*) FILTER (WHERE NOT pal_avoid AND status = 'Sold'
                            AND yr >= t.recency_cutoff)              AS n_sold_recent,
         ROUND(100.0 * COUNT(*) FILTER (WHERE NOT pal_avoid AND status = 'Sold')
               / NULLIF(COUNT(*) FILTER (WHERE NOT pal_avoid), 0), 1) AS sell_through_pct,
         -- percentile_cont returns double precision; the ::numeric cast is
         -- required before round(_, int)
         ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (
                  ORDER BY CASE WHEN NOT pal_avoid THEN h END))::numeric, 0)
           AS band_median_gbp,
         ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (
                  ORDER BY CASE WHEN NOT pal_avoid
                                 AND yr >= t.recency_cutoff THEN h END))::numeric, 0)
           AS recent_median_gbp,
         ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (
                  ORDER BY CASE WHEN NOT pal_avoid THEN realisation END))::numeric, 2)
           AS band_realisation
  FROM banded g
  CROSS JOIN thresholds t
  GROUP BY g.artist_id, g.band_label, g.sort_order, g.play_type, g.arr_active_until
),
drift AS (
  SELECT *,
         ROUND((recent_median_gbp / NULLIF(band_median_gbp, 0))::numeric, 2)
           AS recency_drift
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
       -- per-name K_buy: BP + VAT on premium, + ARR where the levy is live.
       -- A flat constant misprices Park, Airy, Ninnes and Brangwyn.
       ROUND((1 + t.bp * (1 + t.vat)
              + CASE WHEN g.arr_active_until >= CURRENT_DATE
                     THEN t.arr ELSE 0 END)::numeric, 4) AS k_buy,
       -- NULL unless recent evidence clears band_n_gate: an untrustworthy band
       -- must not be able to emit a number at all (fault 2)
       CASE WHEN g.n_sold_recent >= t.band_n_gate THEN
         ROUND((g.recent_median_gbp * (1 - t.d_firm)
                / (1 + t.bp * (1 + t.vat)
                   + CASE WHEN g.arr_active_until >= CURRENT_DATE
                          THEN t.arr ELSE 0 END))::numeric, 0)
       END AS firm_hammer_gbp,
       CASE WHEN g.n_sold_recent >= t.band_n_gate THEN
         ROUND((g.recent_median_gbp * (1 - t.d_firm))::numeric, 0)
       END AS all_in_at_firm_gbp,
       t.band_floor_gbp,
       t.band_ceiling_gbp,
       t.recency_cutoff,
       t.band_n_gate,
       CASE
         WHEN g.n_offered = 0                          THEN 'Palette_excluded'
         WHEN g.n_unsold = 0                           THEN 'Survivorship_suspect'
         WHEN g.n_sold < t.n_gate                      THEN 'Untestable'
         WHEN g.n_sold_recent = 0                      THEN 'No_recent_trade'
         WHEN g.n_sold_recent < t.band_n_gate          THEN 'Thin_recent'
         WHEN g.recency_drift < 0.80                   THEN 'Cooling'
         WHEN g.recent_median_gbp < t.band_floor_gbp   THEN 'Dead_low'
         WHEN g.recent_median_gbp > t.band_ceiling_gbp THEN 'Out_of_envelope'
         ELSE 'Core'
       END AS band_verdict
FROM drift g
CROSS JOIN thresholds t;


-- ---------------------------------------------------------------------------
-- 7. ratify_desk_params
--
-- The write path behind the /desk/params sliders. desk_params is
-- APPEND-NEVER-MUTATE, so every unchanged value is copied forward from
-- desk_params_current inside the insert: the client never has to know the full
-- column list, and a new row cannot silently reset a parameter nobody thought
-- about. This closes the band_factor_cap hazard.
--
-- A rationale is mandatory and enforced here rather than in the UI, so the
-- constraint holds for the MCP path and any future caller.
--
-- Note the column list must be extended in lockstep with any future
-- desk_params column, or that column reverts to its default on every ratify.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ratify_desk_params(
  p_discount_firm   numeric,
  p_discount_stretch numeric,
  p_band_floor_gbp  numeric,
  p_note            text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new uuid;
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

  INSERT INTO public.desk_params (
    effective_from, collector_discount_firm, collector_discount_stretch,
    stale_haircut, remote_haircut, bp_pct_default, vat_premium, arr_rate,
    n_gate, homogeneity_threshold, recency_cutoff,
    sleeve_ceiling_multiple, band_n_gate, band_factor_cap, band_floor_gbp, note
  )
  SELECT CURRENT_DATE, p_discount_firm, p_discount_stretch,
         c.stale_haircut, c.remote_haircut, c.bp_pct_default, c.vat_premium,
         c.arr_rate, c.n_gate, c.homogeneity_threshold, c.recency_cutoff,
         c.sleeve_ceiling_multiple, c.band_n_gate, c.band_factor_cap,
         p_band_floor_gbp, btrim(p_note)
  FROM public.desk_params_current c
  RETURNING params_id INTO v_new;

  RETURN v_new;
END;
$$;

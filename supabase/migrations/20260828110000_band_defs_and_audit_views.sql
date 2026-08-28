-- ============================================================================
-- 20260828110000_band_defs_and_audit_views.sql
--
-- Captures the three pre-existing objects that 20260828100000 could not:
-- size_band_defs (constraints and seed rows), artist_size_band_medians, and
-- play_type_audit. Together the two files close the schema drift recorded in
-- vault flag 2026-08-28-schema-drift-inventory-01.
--
-- Definitions read off live on 2026-08-28 via pg_get_viewdef and pg_constraint.
--
-- ONE DELIBERATE DEVIATION from capture-as-is, in artist_size_band_medians:
-- the live allcells branch has anonymous expression columns, so pg_get_viewdef
-- emits duplicate `round` aliases and "?column?" placeholders and the dump is
-- not reliably re-creatable. That branch is rewritten with explicit aliases.
-- Expressions, ordering and semantics are unchanged; only the aliases differ.
-- Verify with the parity query at the foot of this file before trusting it.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. size_band_defs: primary key and seed rows
--
-- Only one band_set exists in live ('default'). The canonical mandate bands.
-- hi is NULL on the top band, which is what makes the half-open interval join
-- (longest_cm >= lo AND (hi IS NULL OR longest_cm < hi)) include 90cm-plus
-- lots. A sentinel value here instead of NULL would silently drop the entire
-- top band from every consumer.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'size_band_defs_pkey'
  ) THEN
    ALTER TABLE public.size_band_defs
      ADD CONSTRAINT size_band_defs_pkey PRIMARY KEY (band_set, band_label);
  END IF;
END $$;

INSERT INTO public.size_band_defs (band_set, band_label, lo, hi, sort_order, note)
VALUES
  ('default', '<45',    0,  45,   1, NULL),
  ('default', '45-60',  45, 60,   2, NULL),
  ('default', '60-90',  60, 90,   3, NULL),
  ('default', '90+',    90, NULL, 4, NULL)
ON CONFLICT (band_set, band_label) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. artist_size_band_medians
--
-- Per-artist, per-size-band, per-venue-tier medians. Feeds the size-band
-- fair-value anchor in score.ts: the band factor is the band median divided by
-- the artist-level median from the band_label='ALL' row.
--
-- KNOWN DRIFT, captured not fixed: this view hardcodes the recency cutoff at
-- 2023 (r.yr >= 2023) and the fallback band_set at 'default', where
-- artist_buy_band reads both from desk_params / artist_desk_config. Moving
-- recency_cutoff on the params slider will therefore move artist_buy_band and
-- NOT this view, and the two will disagree. Left as-is here because this
-- migration captures live behaviour; raise it as its own change if the two are
-- ever read side by side.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.artist_size_band_medians;

CREATE VIEW public.artist_size_band_medians AS
WITH base AS (
  SELECT c.artist_id,
         c.longest_cm,
         c.hammer_equiv_gbp AS h,
         c.vtype_resolved,
         EXTRACT(year FROM c.sale_date)::integer AS yr
  FROM public.comps c
  WHERE c.authorship       = 'Autograph'::text
    AND c.include_in_stats = 'Y'::text
    AND c.medium_class     = 'Oil'::text
    AND c.status           = 'Sold'::text
    AND c.in_zone          = 'In'::text
    AND c.vtype_resolved = ANY (ARRAY['Exit_Strong'::text, 'Straddle'::text, 'Buy_Regional'::text])
    AND c.hammer_equiv_gbp IS NOT NULL
    AND c.hammer_equiv_gbp > 0::numeric
    AND c.longest_cm IS NOT NULL
    AND c.longest_cm > 0::numeric
),
names AS (
  SELECT DISTINCT base.artist_id
  FROM base
  WHERE base.artist_id IS NOT NULL
),
bandsdef AS (
  SELECT n.artist_id, d.band_label, d.lo, d.hi, d.sort_order
  FROM names n
  LEFT JOIN public.artist_desk_config a ON a.artist_id = n.artist_id
  JOIN public.size_band_defs d ON d.band_set = COALESCE(a.band_set, 'default'::text)
),
scopes (tier_scope, tiers, scope_order) AS (
  VALUES
    ('Buy_Regional'::text,  ARRAY['Buy_Regional'::text],                                    1),
    ('Straddle'::text,      ARRAY['Straddle'::text],                                        2),
    ('Exit_Strong'::text,   ARRAY['Exit_Strong'::text],                                     3),
    ('Straddle_down'::text, ARRAY['Straddle'::text, 'Buy_Regional'::text],                  4),
    ('All_UK'::text,        ARRAY['Exit_Strong'::text, 'Straddle'::text, 'Buy_Regional'::text], 5)
),
gate AS (
  SELECT COALESCE((SELECT desk_params.band_n_gate
                   FROM public.desk_params
                   ORDER BY desk_params.effective_from DESC
                   LIMIT 1), 5) AS g
),
cells AS (
  SELECT b.artist_id,
         b.band_label,
         b.lo AS band_lo,
         b.hi AS band_hi,
         b.sort_order,
         s.tier_scope,
         s.scope_order,
         count(r.h) AS n,
         round(percentile_cont(0.5::double precision)  WITHIN GROUP (ORDER BY (r.h::double precision))::numeric) AS median_gbp,
         round(percentile_cont(0.25::double precision) WITHIN GROUP (ORDER BY (r.h::double precision))::numeric) AS p25_gbp,
         round(percentile_cont(0.75::double precision) WITHIN GROUP (ORDER BY (r.h::double precision))::numeric) AS p75_gbp,
         round(min(r.h)) AS min_gbp,
         round(max(r.h)) AS max_gbp,
         count(r.h) FILTER (WHERE r.yr >= 2023) AS n_recent,
         round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (r.h::double precision))
               FILTER (WHERE r.yr >= 2023)::numeric) AS median_recent_gbp,
         count(r.h) < (SELECT gate.g FROM gate) AS thin
  FROM bandsdef b
  CROSS JOIN scopes s
  LEFT JOIN base r
    ON r.artist_id = b.artist_id
   AND r.longest_cm >= b.lo
   AND (b.hi IS NULL OR r.longest_cm < b.hi)
   AND (r.vtype_resolved = ANY (s.tiers))
  GROUP BY b.artist_id, b.band_label, b.lo, b.hi, b.sort_order, s.tier_scope, s.scope_order
),
-- Artist-level row per tier scope, band_label 'ALL'. This is the denominator
-- for the score.ts band factor: band median / artist median. Aliases made
-- explicit here; the live definition leaves them anonymous and does not dump
-- re-creatably.
allcells AS (
  SELECT n.artist_id,
         'ALL'::text     AS band_label,
         NULL::numeric   AS band_lo,
         NULL::numeric   AS band_hi,
         0               AS sort_order,
         s.tier_scope,
         s.scope_order,
         count(r.h) AS n,
         round(percentile_cont(0.5::double precision)  WITHIN GROUP (ORDER BY (r.h::double precision))::numeric) AS median_gbp,
         round(percentile_cont(0.25::double precision) WITHIN GROUP (ORDER BY (r.h::double precision))::numeric) AS p25_gbp,
         round(percentile_cont(0.75::double precision) WITHIN GROUP (ORDER BY (r.h::double precision))::numeric) AS p75_gbp,
         round(min(r.h)) AS min_gbp,
         round(max(r.h)) AS max_gbp,
         count(r.h) FILTER (WHERE r.yr >= 2023) AS n_recent,
         round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (r.h::double precision))
               FILTER (WHERE r.yr >= 2023)::numeric) AS median_recent_gbp,
         count(r.h) < (SELECT gate.g FROM gate) AS thin
  FROM names n
  CROSS JOIN scopes s
  LEFT JOIN base r
    ON r.artist_id = n.artist_id
   AND (r.vtype_resolved = ANY (s.tiers))
  GROUP BY n.artist_id, s.tier_scope, s.scope_order
)
SELECT artist_id, band_label, band_lo, band_hi, sort_order, tier_scope,
       scope_order, n, median_gbp, p25_gbp, p75_gbp, min_gbp, max_gbp,
       n_recent, median_recent_gbp, thin
FROM cells
UNION ALL
SELECT artist_id, band_label, band_lo, band_hi, sort_order, tier_scope,
       scope_order, n, median_gbp, p25_gbp, p75_gbp, min_gbp, max_gbp,
       n_recent, median_recent_gbp, thin
FROM allcells;


-- ---------------------------------------------------------------------------
-- 3. play_type_audit
--
-- Advisory view suggesting a play_type per tracked name. Captured verbatim.
--
-- TWO STANDING DEFECTS, recorded here rather than silently fixed. Both are
-- tracked in vault flag 2026-08-28-play-type-enum-drift-01 (P1).
--
--   (a) suggested_play can only ever return 'Untracked', 'Quality_hold' or a
--       'Pending: ...' string. It has NO branch producing Sleeper_Value_add,
--       Post_sale or Discovery_Watch. artists.play_type appears to have been
--       backfilled from this view, which is why live reads 30 Quality_hold and
--       3 Pending with no other distinction. This view is the origin of the
--       flat data, not merely a reporter of it. Do not wire any eligibility
--       gate to play_type until both the enum and this CASE are extended and
--       the rows are reconciled to vault verdicts name by name.
--
--   (b) The carve-out list is inline: Cooke and Pritchett are hardcoded to
--       Quality_hold, bypassing the n_uk_auto_oil >= 8 gate. This is the
--       "carve-out inline-list debt" carried on the mandate. As at 2026-08-28
--       the carve-out is actively wrong for Pritchett: his 45-60 and 60-90
--       bands return zero sold comps since 2023 (see vault verdict
--       2026-08-28-pritchett-tier-table-unsupported-01), so the gate he is
--       being carved out of is the gate that would now catch him.
--
-- Depends on comps_rollup, artist_zone_fitness, and the level_t enum.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.play_type_audit;

CREATE VIEW public.play_type_audit AS
SELECT a.artist_id,
       a.display_name,
       a.play_type AS current_play,
       CASE
         WHEN NOT a.tracked THEN 'Untracked'::text
         WHEN a.paper_sleeve THEN 'Quality_hold'::text
         WHEN a.artist_id = ANY (ARRAY['edward-william-cooke'::text, 'edward-pritchett'::text])
           THEN 'Quality_hold'::text
         WHEN COALESCE(c.n_uk_auto_oil, 0::bigint) < 8
           OR c.median_uk_hammer_gbp IS NULL THEN 'Pending: no home lane'::text
         WHEN COALESCE(c.level_read, 'Unknown'::level_t) = 'Unknown'::level_t
           THEN 'Pending: not priceable'::text
         WHEN COALESCE(z.zone_fitness, 'Untestable'::text) = 'Untestable'::text
           AND COALESCE(c.n_uk_auto_oil, 0::bigint) < 12
           THEN 'Pending: slice unmeasurable (thin body)'::text
         ELSE 'Quality_hold'::text
       END AS suggested_play,
       a.paper_sleeve,
       c.n_uk_auto_oil,
       c.median_uk_hammer_gbp,
       c.level_read,
       z.zone_fitness,
       z.zone_conf
FROM public.artists a
LEFT JOIN public.comps_rollup c        ON c.artist_id = a.artist_id
LEFT JOIN public.artist_zone_fitness z ON z.artist_id = a.artist_id
WHERE a.tracked;


-- ============================================================================
-- PARITY CHECK. Run after applying. Every count must match the pre-migration
-- value; the rewritten allcells aliases must not have changed a single row.
--
--   SELECT
--     (SELECT count(*) FROM public.size_band_defs)             AS band_defs,      -- expect 4
--     (SELECT count(*) FROM public.artist_size_band_medians)   AS band_medians,
--     (SELECT count(*) FROM public.artist_size_band_medians
--       WHERE band_label = 'ALL')                              AS all_rows,
--     (SELECT count(*) FROM public.play_type_audit)            AS audit_rows,     -- expect 33
--     (SELECT count(*) FROM public.artist_buy_band)            AS buy_bands;
--
-- Take these counts BEFORE applying the migration and compare. If band_medians
-- moves, the allcells rewrite changed behaviour and must be investigated
-- rather than accepted.
-- ============================================================================

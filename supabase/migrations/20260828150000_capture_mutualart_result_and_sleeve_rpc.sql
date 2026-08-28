-- 20260828150000_capture_mutualart_result_and_sleeve_rpc.sql
--
-- Parity capture. Derived from a whole-schema drift sweep on 2026-08-28 and the
-- follow-up introspection: information_schema.columns, pg_constraint, pg_indexes,
-- pg_get_functiondef and pg_get_viewdef against live. Closes the last nine gaps
-- the sweep found. Captures only; the apply_sleeve_multiple defect noted below is
-- fixed in 20260828150100, kept separate so this file stays a pure capture.

-- ---------------------------------------------------------------------------
-- 1. artists.mutualart_url and its format check
-- ---------------------------------------------------------------------------
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS mutualart_url text;

ALTER TABLE public.artists
  DROP CONSTRAINT IF EXISTS mutualart_url_is_artist_id;

ALTER TABLE public.artists
  ADD CONSTRAINT mutualart_url_is_artist_id
  CHECK (((mutualart_url IS NULL) OR (mutualart_url ~* '^https://www\.mutualart\.com/Artist/[^/]+/[0-9A-F]{16}'::text)));

-- ---------------------------------------------------------------------------
-- 2. lots result capture, plus the partial index that drives the outstanding
--    results queue. Never committed: no migration for these existed in the repo.
-- ---------------------------------------------------------------------------
ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS result_hammer_gbp numeric;

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS result_captured_at date;

CREATE INDEX IF NOT EXISTS lots_awaiting_result_idx ON public.lots
  USING btree (sale_date) WHERE ((result_hammer_gbp IS NULL) AND (status <> 'won'::text));

-- ---------------------------------------------------------------------------
-- 3. apply_sleeve_multiple, the RPC behind the /desk/params sleeve slider.
--    Captured exactly as live, defect included. SECURITY INVOKER, no proconfig.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_sleeve_multiple(p_multiple numeric)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_new numeric;
BEGIN
  IF p_multiple IS NULL OR p_multiple < 0.30 OR p_multiple > 0.60 THEN
    RAISE EXCEPTION 'sleeve multiple % out of allowed range 0.30-0.60', p_multiple;
  END IF;

  -- (B) clone the current params row with the new multiple; history preserved
  INSERT INTO public.desk_params (
    collector_discount_firm, collector_discount_stretch, stale_haircut, remote_haircut,
    bp_pct_default, vat_premium, arr_rate, n_gate, homogeneity_threshold, recency_cutoff,
    note, sleeve_ceiling_multiple
  )
  SELECT collector_discount_firm, collector_discount_stretch, stale_haircut, remote_haircut,
         bp_pct_default, vat_premium, arr_rate, n_gate, homogeneity_threshold, recency_cutoff,
         'sleeve_ceiling_multiple -> ' || p_multiple::text, p_multiple
  FROM public.desk_params_current;

  -- recompute every sleeve ceiling from the new lever
  UPDATE public.artist_desk_config adc
  SET paper_ceiling_gbp = round(adc.inzone_finished_wc_median_gbp * p_multiple / 50) * 50
  WHERE adc.inzone_finished_wc_median_gbp IS NOT NULL;

  SELECT p_multiple INTO v_new;
  RETURN v_new;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. artist_360 and book_screen both surface artists.mutualart_url, so their
--    live bodies could not exist in the repo until section 1 landed. DROP then
--    CREATE, not CREATE OR REPLACE: mutualart_url sits mid-list in both and a
--    mid-list column insert fires 42P16.
--
--    Neither carries security_invoker on live. The repo asserted it on both.
--    Live wins: with every RLS policy scoped TO authenticated and no anon policy
--    anywhere, turning invoker on would stop anon reading these two views and
--    take the deployed Book surface down. See the note in the delivery.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.artist_360;

CREATE VIEW public.artist_360 AS
 SELECT a.artist_id,
    a.display_name,
    a.dates,
    a.tier,
    a.arr_status,
    a.play_type,
    a.palette_pref,
    a.mutualart_url,
    c.median_uk_hammer_gbp,
    c.sell_through_pct,
    c.n_uk_auto_oil,
    c.data_confidence,
    c.buy_regional_realisation,
    c.in_zone_realisation,
    c.median_realisation,
    c.n_exit_strong,
    c.n_buy_regional,
    c.thin_exit_flag,
    c.spread_trusted,
    c.matched_spread,
    c.matched_n,
    c.exit_vs_regional_spread,
    c.arb_edge_raw,
    c.buy_edge_flag,
    c.arb_read,
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
     LEFT JOIN ( SELECT notes.artist_id,
            count(*) AS open_flags
           FROM notes
          WHERE notes.note_type = 'Flag'::note_type_t AND notes.action_status = 'Open'::action_status_t
          GROUP BY notes.artist_id) f ON f.artist_id = a.artist_id;

DROP VIEW IF EXISTS public.book_screen;

CREATE VIEW public.book_screen AS
 SELECT a.artist_id,
    a.display_name,
    a.dates,
    a.play_type,
    a.tier,
    a.arr_status,
    a.palette_pref,
    a.paper_sleeve,
    a.mutualart_url,
    c.buy_edge_flag,
    c.median_realisation,
    c.buy_regional_realisation,
    c.matched_spread,
    c.spread_trusted,
    c.thin_exit_flag,
    c.data_confidence,
    c.sell_through_pct,
    c.median_uk_hammer_gbp,
    c.exit_vs_regional_spread,
    c.level_read,
    c.n_exit_strong,
    c.n_buy_regional,
    c.updated_at AS comps_updated_at,
    COALESCE(f.open_flags, 0::bigint)::integer AS open_flags,
    c.price_cagr_full,
    c.sell_through_trend,
    c.ceiling_breach,
    z.zone_fitness,
    z.zone_conf,
    z.st_premium_pp AS zone_sellthrough_premium_pp
   FROM artists a
     LEFT JOIN comps_rollup c ON c.artist_id = a.artist_id
     LEFT JOIN artist_zone_fitness z ON z.artist_id = a.artist_id
     LEFT JOIN ( SELECT notes.artist_id,
            count(*) AS open_flags
           FROM notes
          WHERE notes.note_type = 'Flag'::note_type_t AND notes.action_status = 'Open'::action_status_t
          GROUP BY notes.artist_id) f ON f.artist_id = a.artist_id
  WHERE a.tracked;

-- ---------------------------------------------------------------------------
-- 5. reloptions the repo never recorded. Set in place: the bodies are already
--    correct, so there is nothing to recreate.
-- ---------------------------------------------------------------------------
ALTER VIEW public.comps_timeseries SET (security_invoker = off);

ALTER VIEW public.vocab_enum SET (security_invoker = on);

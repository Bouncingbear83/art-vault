-- 20260826000000_schema_baseline.sql
--
-- Authoritative schema baseline for Bouncingbear83/art-vault, generated from the
-- live catalogue on 2026-08-26 (pg_catalog DDL, not hand-transcribed). Earliest
-- migration: everything after it migrates forward from here. Supersedes the
-- committed migrations that misrepresented the schema (comps_rollup as a table,
-- pre-_t enums) and folds in the collector-grammar session capture, which becomes
-- redundant once this lands.
--
-- 20 enums · 13 tables · 34 constraints · 10 indexes · 6 functions · 7 triggers ·
-- 7 views (dependency-ordered) · RLS on 13 tables · 13 policies.
--
-- Caveats:
--  * security_invoker=on re-asserted on the four analytics views (catalogue view-def
--    drops reloptions). Verify the other three: SELECT relname, reloptions FROM
--    pg_class WHERE relkind='v' AND relnamespace='public'::regnamespace;
--  * 11 legacy enums are superseded by _t versions and used by no column. Kept for
--    fidelity; optional drop block at the foot.


-- ==================== 1. ENUM TYPES ====================
-- orphaned legacy enum (action_status); superseded, safe to drop (see foot)
CREATE TYPE public.action_status AS ENUM ('Open', 'Actioned', 'Dismissed');
CREATE TYPE public.action_status_t AS ENUM ('Open', 'Actioned', 'Superseded', 'Wontfix', 'Archived');
-- orphaned legacy enum (arr_status); superseded, safe to drop (see foot)
CREATE TYPE public.arr_status AS ENUM ('In ARR', 'ARR Expired', 'Unknown');
-- orphaned legacy enum (artist_tier); superseded, safe to drop (see foot)
CREATE TYPE public.artist_tier AS ENUM ('Core', 'Satellite', 'Speculative', 'Retired');
-- orphaned legacy enum (confidence_level); superseded, safe to drop (see foot)
CREATE TYPE public.confidence_level AS ENUM ('Low', 'Medium', 'High');
CREATE TYPE public.confidence_t AS ENUM ('High', 'Med', 'Low');
-- orphaned legacy enum (data_confidence); superseded, safe to drop (see foot)
CREATE TYPE public.data_confidence AS ENUM ('Thin', 'Adequate', 'Strong');
-- orphaned legacy enum (decision_kind); superseded, safe to drop (see foot)
CREATE TYPE public.decision_kind AS ENUM ('Buy', 'Watch', 'Avoid', 'Undecided');
CREATE TYPE public.decision_t AS ENUM ('Reclassify', 'Set_Trigger', 'Add_Vocab', 'Patch_Taxonomy', 'Buy', 'Skip', 'Monitor', 'No_Action');
CREATE TYPE public.level_t AS ENUM ('Cheap', 'Fair', 'Rich', 'Unknown');
-- orphaned legacy enum (note_scope); superseded, safe to drop (see foot)
CREATE TYPE public.note_scope AS ENUM ('Artist', 'Venue', 'System');
CREATE TYPE public.note_scope_t AS ENUM ('Artist', 'Venue', 'Subject', 'Medium', 'System', 'Portfolio', 'Lot');
-- orphaned legacy enum (note_type); superseded, safe to drop (see foot)
CREATE TYPE public.note_type AS ENUM ('Verdict', 'Trigger', 'Flag', 'Observation');
CREATE TYPE public.note_type_t AS ENUM ('Verdict', 'Classification', 'Trigger', 'Flag', 'Learning', 'Playbook', 'Lot');
-- orphaned legacy enum (palette_pref); superseded, safe to drop (see foot)
CREATE TYPE public.palette_pref AS ENUM ('Sunlit', 'Silvered', 'Tonal', 'High Key', 'Dark');
-- orphaned legacy enum (play_type); superseded, safe to drop (see foot)
CREATE TYPE public.play_type AS ENUM ('Sunlit Coastal', 'Marine', 'Continental Oil', 'British Impressionist', 'Landscape', 'Portrait', 'Other');
CREATE TYPE public.play_type_t AS ENUM ('Arbitrage', 'Quality_hold', 'Pending', 'NA');
-- orphaned legacy enum (priority_level); superseded, safe to drop (see foot)
CREATE TYPE public.priority_level AS ENUM ('P1', 'P2', 'P3');
CREATE TYPE public.priority_t AS ENUM ('P1', 'P2', 'P3');
CREATE TYPE public.trend_t AS ENUM ('Up', 'Flat', 'Down', 'Unknown');

-- ==================== 2. TABLES ====================
CREATE TABLE IF NOT EXISTS public.artist_desk_config (artist_id text NOT NULL, discount_class text NOT NULL DEFAULT 'quality_hold_wanted'::text, discount_override_firm numeric, discount_override_stretch numeric, commission_floor_gbp numeric, min_longest_cm integer, strong_venue_default boolean NOT NULL DEFAULT false, paper_primary boolean NOT NULL DEFAULT false, paper_ceiling_gbp numeric, arr_active_until date, floor_reviewed date, note text, updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.artists (artist_id text NOT NULL, display_name text NOT NULL, dates text, tier text, play_type play_type_t DEFAULT 'Pending'::play_type_t, palette_pref text, arr_status text, updated_at timestamp with time zone DEFAULT now(), paper_sleeve boolean DEFAULT false, birth_year integer, death_year integer, tracked boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS public.budget (period_year integer NOT NULL, envelope_gbp numeric NOT NULL DEFAULT 0, committed_gbp numeric NOT NULL DEFAULT 0, updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.comps (sale_key text NOT NULL, artist_id text, artist text, title text, authorship text, medium_raw text, medium_class text, subject text, palette text, h_cm numeric, w_cm numeric, est_low numeric, est_high numeric, currency text, realized_native numeric, realized_basis text, status text, venue text, sale_date date, confirmed_ref text, venue_canonical text, vtype_resolved text, geo_resolved text, auto_ref text, ref text, times_seen integer, repeat_flag text, dup_flag text, longest_cm numeric, wall_presence text, fx numeric, est_mid_gbp numeric, realized_gbp numeric, hammer_equiv_gbp numeric, realisation numeric, in_zone text, medium_pref text, palette_pref_hit text, trigger_gbp numeric, include_in_stats text, buy_candidate text, sheet_grade text, condition_checked text, remote_haircut_pct numeric, loaded_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.comps_raw (sale_key text NOT NULL, artist_id text, title text, authorship text, medium_class text, status text, vtype_resolved text, geo_resolved text, subject text, in_zone boolean, longest_cm numeric, est_mid_gbp numeric, hammer_equiv_gbp numeric, realisation numeric, sale_date date, loaded_at timestamp with time zone DEFAULT now());
CREATE TABLE IF NOT EXISTS public.comps_stage (id bigint NOT NULL, artist text NOT NULL, title text, authorship text, medium_raw text, medium_class text, subject text, palette text, h_cm numeric, w_cm numeric, est_low numeric, est_high numeric, currency text, realized_native numeric, realized_basis text, status text, venue text, sale_date date, load_batch text NOT NULL DEFAULT 'sharp_2026-08-23'::text, ingested_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.desk_params (params_id uuid NOT NULL DEFAULT gen_random_uuid(), effective_from timestamp with time zone NOT NULL DEFAULT now(), collector_discount_firm numeric NOT NULL, collector_discount_stretch numeric NOT NULL, stale_haircut numeric NOT NULL DEFAULT 0.20, remote_haircut numeric NOT NULL DEFAULT 0.40, bp_pct_default numeric NOT NULL DEFAULT 0.28, vat_premium numeric NOT NULL DEFAULT 0.20, arr_rate numeric NOT NULL DEFAULT 0.04, n_gate integer NOT NULL DEFAULT 8, homogeneity_threshold numeric NOT NULL DEFAULT 0.25, recency_cutoff integer NOT NULL DEFAULT 2023, note text, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.lots (lot_id uuid NOT NULL DEFAULT gen_random_uuid(), sale_key text NOT NULL, artist_id text NOT NULL, captured_by text NOT NULL DEFAULT 'claude'::text, source_ref text, classification_confidence numeric, status text NOT NULL DEFAULT 'open'::text, title text NOT NULL, authorship text NOT NULL DEFAULT 'Autograph'::text, medium_raw text, medium_class text, subject text, palette text, palette_kw_only boolean NOT NULL DEFAULT false, longest_cm numeric, est_low numeric, est_high numeric, currency text, venue text, sale_date date, in_zone text, strong_venue_candidate boolean NOT NULL DEFAULT false, quality_delta_input numeric, quality_override_reason text, taste_ok boolean, condition_checked boolean NOT NULL DEFAULT false, condition_note text, provenance_note text, sale_context text, sheet_grade text, decision text, binding_constraint text, lane text, fair_value_gbp numeric, anchor_tier text, anchor_rung integer, anchor_n integer, anchor_confidence text, quality_delta_value numeric, k_buy numeric, ladder_firm_gbp numeric, ladder_stretch_gbp numeric, ladder_tightened_gbp numeric, ladder_commission_gbp numeric, all_in_at_firm_gbp numeric, budget_ok boolean, params_id text, flags text[] NOT NULL DEFAULT '{}'::text[], decision_json jsonb, lot_note_id uuid, position_id uuid, scored_at timestamp with time zone, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.note_tags (note_id uuid NOT NULL, tag text NOT NULL);
CREATE TABLE IF NOT EXISTS public.notes (note_id uuid NOT NULL DEFAULT gen_random_uuid(), slug text, note_type note_type_t NOT NULL, scope note_scope_t NOT NULL, artist_id text, entity_key text, decision decision_t DEFAULT 'No_Action'::decision_t, action_status action_status_t DEFAULT 'Open'::action_status_t, play_type play_type_t DEFAULT 'NA'::play_type_t, confidence confidence_t DEFAULT 'Med'::confidence_t, priority priority_t, valid_from date NOT NULL DEFAULT CURRENT_DATE, valid_to date, supersedes uuid, source_ref text, body text NOT NULL, created_by text DEFAULT 'claude'::text, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
CREATE TABLE IF NOT EXISTS public.positions (position_id uuid NOT NULL DEFAULT gen_random_uuid(), artist_id text, title text, sale_key text, house text, hammer_gbp numeric, all_in_gbp numeric, buy_date date, condition_status text, subject text, palette text, longest_cm numeric, rationale text, params_id uuid, lot_note_id uuid, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.triggers (artist_id text NOT NULL, tier_label text NOT NULL, walkaway_gbp numeric, basis text DEFAULT 'all-in'::text, medium_class text, min_longest_cm numeric, note text, updated_at timestamp with time zone DEFAULT now());
CREATE TABLE IF NOT EXISTS public.vocab_note_tag (tag text NOT NULL, description text);

-- ==================== 3. CONSTRAINTS ====================
ALTER TABLE public.artist_desk_config ADD CONSTRAINT artist_desk_config_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES artists(artist_id) ON DELETE CASCADE;
ALTER TABLE public.artist_desk_config ADD CONSTRAINT artist_desk_config_pkey PRIMARY KEY (artist_id);
ALTER TABLE public.notes ADD CONSTRAINT artist_scope_requires_id CHECK (((scope <> 'Artist'::note_scope_t) OR (artist_id IS NOT NULL)));
ALTER TABLE public.artists ADD CONSTRAINT artists_pkey PRIMARY KEY (artist_id);
ALTER TABLE public.budget ADD CONSTRAINT budget_pkey PRIMARY KEY (period_year);
ALTER TABLE public.comps ADD CONSTRAINT comps_pkey PRIMARY KEY (sale_key);
ALTER TABLE public.comps_raw ADD CONSTRAINT comps_raw_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES artists(artist_id);
ALTER TABLE public.comps_raw ADD CONSTRAINT comps_raw_pkey PRIMARY KEY (sale_key);
ALTER TABLE public.comps_stage ADD CONSTRAINT comps_stage_artist_title_venue_sale_date_key UNIQUE (artist, title, venue, sale_date);
ALTER TABLE public.comps_stage ADD CONSTRAINT comps_stage_pkey PRIMARY KEY (id);
ALTER TABLE public.desk_params ADD CONSTRAINT desk_params_pkey PRIMARY KEY (params_id);
ALTER TABLE public.notes ADD CONSTRAINT flag_requires_priority CHECK (((note_type <> 'Flag'::note_type_t) OR (priority IS NOT NULL)));
ALTER TABLE public.lots ADD CONSTRAINT lots_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES artists(artist_id) ON DELETE CASCADE;
ALTER TABLE public.lots ADD CONSTRAINT lots_captured_by_check CHECK ((captured_by = ANY (ARRAY['claude'::text, 'manual'::text, 'radar'::text])));
ALTER TABLE public.lots ADD CONSTRAINT lots_decision_check CHECK ((decision = ANY (ARRAY['Buy'::text, 'Skip'::text, 'Monitor'::text])));
ALTER TABLE public.lots ADD CONSTRAINT lots_in_zone_check CHECK ((in_zone = ANY (ARRAY['In'::text, 'Skip'::text])));
ALTER TABLE public.lots ADD CONSTRAINT lots_lane_check CHECK ((lane = ANY (ARRAY['oil'::text, 'paper'::text, 'pritchett-table'::text])));
ALTER TABLE public.lots ADD CONSTRAINT lots_pkey PRIMARY KEY (lot_id);
ALTER TABLE public.lots ADD CONSTRAINT lots_sale_key_key UNIQUE (sale_key);
ALTER TABLE public.lots ADD CONSTRAINT lots_status_check CHECK ((status = ANY (ARRAY['open'::text, 'monitor'::text, 'skipped'::text, 'won'::text, 'lost'::text, 'expired'::text])));
ALTER TABLE public.note_tags ADD CONSTRAINT note_tags_note_id_fkey FOREIGN KEY (note_id) REFERENCES notes(note_id) ON DELETE CASCADE;
ALTER TABLE public.note_tags ADD CONSTRAINT note_tags_pkey PRIMARY KEY (note_id, tag);
ALTER TABLE public.note_tags ADD CONSTRAINT note_tags_tag_fkey FOREIGN KEY (tag) REFERENCES vocab_note_tag(tag);
ALTER TABLE public.notes ADD CONSTRAINT notes_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES artists(artist_id);
ALTER TABLE public.notes ADD CONSTRAINT notes_pkey PRIMARY KEY (note_id);
ALTER TABLE public.notes ADD CONSTRAINT notes_slug_key UNIQUE (slug);
ALTER TABLE public.notes ADD CONSTRAINT notes_supersedes_fkey FOREIGN KEY (supersedes) REFERENCES notes(note_id);
ALTER TABLE public.positions ADD CONSTRAINT positions_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES artists(artist_id) ON DELETE SET NULL;
ALTER TABLE public.positions ADD CONSTRAINT positions_lot_note_id_fkey FOREIGN KEY (lot_note_id) REFERENCES notes(note_id) ON DELETE SET NULL;
ALTER TABLE public.positions ADD CONSTRAINT positions_params_id_fkey FOREIGN KEY (params_id) REFERENCES desk_params(params_id) ON DELETE SET NULL;
ALTER TABLE public.positions ADD CONSTRAINT positions_pkey PRIMARY KEY (position_id);
ALTER TABLE public.triggers ADD CONSTRAINT triggers_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES artists(artist_id);
ALTER TABLE public.triggers ADD CONSTRAINT triggers_pkey PRIMARY KEY (artist_id, tier_label);
ALTER TABLE public.vocab_note_tag ADD CONSTRAINT vocab_note_tag_pkey PRIMARY KEY (tag);

-- ==================== 4. INDEXES ====================
CREATE INDEX comps_artist_idx ON public.comps USING btree (artist_id);
CREATE INDEX comps_raw_artist_id_idx ON public.comps_raw USING btree (artist_id);
CREATE INDEX comps_slice_idx ON public.comps USING btree (artist_id, vtype_resolved, medium_class, status);
CREATE INDEX lots_artist_idx ON public.lots USING btree (artist_id);
CREATE INDEX lots_captured_idx ON public.lots USING btree (captured_by);
CREATE INDEX lots_decision_idx ON public.lots USING btree (decision);
CREATE INDEX lots_sale_date_idx ON public.lots USING btree (sale_date DESC);
CREATE INDEX lots_status_idx ON public.lots USING btree (status);
CREATE INDEX positions_artist_idx ON public.positions USING btree (artist_id);
CREATE INDEX positions_buy_date_idx ON public.positions USING btree (buy_date);

-- ==================== 5. FUNCTIONS ====================
CREATE OR REPLACE FUNCTION public._recompute_budget_year(yr integer)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  insert into public.budget (period_year, envelope_gbp, committed_gbp)
    values (yr, 0, 0) on conflict (period_year) do nothing;
  update public.budget b
    set committed_gbp = coalesce(
      (select sum(all_in_gbp) from public.positions where extract(year from buy_date)::int = yr), 0)
    where b.period_year = yr;
$function$
;
CREATE OR REPLACE FUNCTION public.flip_superseded()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.supersedes IS NOT NULL THEN
    UPDATE public.notes
       SET action_status = 'Superseded'
     WHERE note_id = NEW.supersedes
       AND action_status = 'Open';   -- preserve deliberate terminal states (Actioned / Wontfix / Archived)
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT coalesce(auth.jwt() ->> 'bertbroadhead@gmail.com', '') = '<your-real-signed-in-email>' $function$
;
CREATE OR REPLACE FUNCTION public.positions_budget_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT' or tg_op = 'UPDATE') and new.buy_date is not null then
    perform public._recompute_budget_year(extract(year from new.buy_date)::int);
  end if;
  if (tg_op = 'UPDATE' or tg_op = 'DELETE') and old.buy_date is not null then
    perform public._recompute_budget_year(extract(year from old.buy_date)::int);
  end if;
  return null;
end $function$
;
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_note(p_note_id uuid, p_tags text[] DEFAULT NULL::text[], p_valid_to date DEFAULT NULL::date, p_clear_valid_to boolean DEFAULT false, p_action_status action_status_t DEFAULT NULL::action_status_t)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_bad text;
begin
  if not exists (select 1 from notes where note_id = p_note_id) then
    raise exception 'update_note: note_id % not found', p_note_id
      using errcode = 'no_data_found';
  end if;
 
  -- Validate tags up front for a readable error (the FK would also reject).
  if p_tags is not null and array_length(p_tags, 1) is not null then
    select string_agg(t, ', ')
      into v_bad
      from unnest(p_tags) as t
     where t not in (select tag from vocab_note_tag);
    if v_bad is not null then
      raise exception 'update_note: unknown tag(s): %', v_bad
        using errcode = 'foreign_key_violation';
    end if;
  end if;
 
  -- Metadata: touch only what was asked for. updated_at is bumped by the
  -- existing notes_touch trigger.
  update notes
     set valid_to = case
                      when p_clear_valid_to          then null
                      when p_valid_to is not null    then p_valid_to
                      else valid_to
                    end,
         action_status = coalesce(p_action_status, action_status)
   where note_id = p_note_id;
 
  -- Tags: replace-in-place when provided.
  if p_tags is not null then
    delete from note_tags where note_id = p_note_id;
    if array_length(p_tags, 1) is not null then
      insert into note_tags (note_id, tag)
      select p_note_id, unnest(p_tags)
      on conflict do nothing;
    end if;
  end if;
 
  -- Return the note + its tag array, mirroring the search_notes shape.
  return (
    select to_jsonb(n) || jsonb_build_object(
             'tags',
             coalesce(
               (select array_agg(tag order by tag)
                  from note_tags where note_id = n.note_id),
               array[]::text[])
           )
    from notes n
    where n.note_id = p_note_id
  );
end;
$function$
;

-- ==================== 6. TRIGGERS ====================
CREATE TRIGGER adc_touch BEFORE UPDATE ON public.artist_desk_config FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER artist_desk_config_touch BEFORE UPDATE ON public.artist_desk_config FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER budget_touch BEFORE UPDATE ON public.budget FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER lots_touch BEFORE UPDATE ON public.lots FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER notes_touch BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER positions_budget AFTER INSERT OR DELETE OR UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION positions_budget_sync();
CREATE TRIGGER trg_flip_superseded AFTER INSERT OR UPDATE OF supersedes ON public.notes FOR EACH ROW EXECUTE FUNCTION flip_superseded();

-- ==================== 7. VIEWS (dependency-ordered) ====================
CREATE OR REPLACE VIEW public.comps_rollup WITH (security_invoker = on) AS  WITH agg AS (
         SELECT comps.artist_id,
            (percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((comps.hammer_equiv_gbp)::double precision)) FILTER (WHERE ((comps.medium_class = 'Oil'::text) AND (comps.geo_resolved = 'UK'::text) AND (comps.status = 'Sold'::text) AND (comps.hammer_equiv_gbp IS NOT NULL))))::numeric AS median_uk_hammer_gbp,
            count(*) FILTER (WHERE ((comps.medium_class = 'Oil'::text) AND (comps.vtype_resolved = 'Exit_Strong'::text) AND (comps.status = 'Sold'::text) AND (comps.hammer_equiv_gbp > (0)::numeric))) AS n_exit_strong,
            count(*) FILTER (WHERE ((comps.medium_class = 'Oil'::text) AND (comps.vtype_resolved = 'Buy_Regional'::text) AND (comps.status = 'Sold'::text) AND (comps.hammer_equiv_gbp > (0)::numeric))) AS n_buy_regional,
            (percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((comps.hammer_equiv_gbp)::double precision)) FILTER (WHERE ((comps.medium_class = 'Oil'::text) AND (comps.in_zone = 'In'::text) AND (comps.vtype_resolved = 'Exit_Strong'::text) AND (comps.status = 'Sold'::text) AND (comps.hammer_equiv_gbp IS NOT NULL))))::numeric AS exit_median,
            (percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((comps.hammer_equiv_gbp)::double precision)) FILTER (WHERE ((comps.medium_class = 'Oil'::text) AND (comps.in_zone = 'In'::text) AND (comps.vtype_resolved = 'Buy_Regional'::text) AND (comps.status = 'Sold'::text) AND (comps.hammer_equiv_gbp IS NOT NULL))))::numeric AS regional_median,
            (percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((comps.realisation)::double precision)) FILTER (WHERE ((comps.medium_class = 'Oil'::text) AND (comps.in_zone = 'In'::text) AND (comps.vtype_resolved = 'Buy_Regional'::text) AND (comps.status = 'Sold'::text) AND (comps.est_mid_gbp >= (200)::numeric) AND (comps.realisation IS NOT NULL))))::numeric AS buy_regional_realisation,
            (percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((comps.realisation)::double precision)) FILTER (WHERE ((comps.medium_class = 'Oil'::text) AND (comps.in_zone = 'In'::text) AND (comps.geo_resolved = 'UK'::text) AND (comps.status = 'Sold'::text) AND (comps.est_mid_gbp >= (200)::numeric) AND (comps.realisation IS NOT NULL))))::numeric AS in_zone_realisation,
            count(*) FILTER (WHERE ((comps.medium_class = 'Oil'::text) AND (comps.geo_resolved = 'UK'::text) AND (comps.status = 'Sold'::text))) AS sold_uk,
            count(*) FILTER (WHERE ((comps.medium_class = 'Oil'::text) AND (comps.geo_resolved = 'UK'::text) AND (comps.status = 'Not_Sold'::text))) AS ns_uk
           FROM comps
          WHERE ((comps.authorship = 'Autograph'::text) AND (comps.include_in_stats = 'Y'::text))
          GROUP BY comps.artist_id
        ), base AS (
         SELECT comps.artist_id,
            comps.hammer_equiv_gbp AS h,
            comps.sale_date,
            comps.status,
            (EXTRACT(year FROM comps.sale_date))::integer AS yr
           FROM comps
          WHERE ((comps.authorship = 'Autograph'::text) AND (comps.include_in_stats = 'Y'::text) AND (comps.medium_class = 'Oil'::text) AND (comps.geo_resolved = 'UK'::text))
        ), win AS (
         SELECT base.artist_id,
            (percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((base.h)::double precision)) FILTER (WHERE ((base.status = 'Sold'::text) AND (base.sale_date >= (CURRENT_DATE - '3 years'::interval)))))::numeric AS med_recent,
            (percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((base.h)::double precision)) FILTER (WHERE ((base.status = 'Sold'::text) AND (base.sale_date < (CURRENT_DATE - '3 years'::interval)) AND (base.sale_date >= (CURRENT_DATE - '6 years'::interval)))))::numeric AS med_prior,
            count(*) FILTER (WHERE ((base.status = 'Sold'::text) AND (base.sale_date >= (CURRENT_DATE - '3 years'::interval)))) AS n_recent,
            count(*) FILTER (WHERE ((base.status = 'Sold'::text) AND (base.sale_date < (CURRENT_DATE - '3 years'::interval)) AND (base.sale_date >= (CURRENT_DATE - '6 years'::interval)))) AS n_prior,
            count(*) FILTER (WHERE ((base.status = 'Sold'::text) AND (base.sale_date >= (CURRENT_DATE - '3 years'::interval)))) AS s_rec,
            count(*) FILTER (WHERE ((base.status = ANY (ARRAY['Sold'::text, 'Not_Sold'::text])) AND (base.sale_date >= (CURRENT_DATE - '3 years'::interval)))) AS off_rec,
            count(*) FILTER (WHERE ((base.status = 'Sold'::text) AND (base.sale_date < (CURRENT_DATE - '3 years'::interval)) AND (base.sale_date >= (CURRENT_DATE - '6 years'::interval)))) AS s_pri,
            count(*) FILTER (WHERE ((base.status = ANY (ARRAY['Sold'::text, 'Not_Sold'::text])) AND (base.sale_date < (CURRENT_DATE - '3 years'::interval)) AND (base.sale_date >= (CURRENT_DATE - '6 years'::interval)))) AS off_pri
           FROM base
          GROUP BY base.artist_id
        ), lvl AS (
         SELECT base.artist_id,
            (percentile_cont((0.25)::double precision) WITHIN GROUP (ORDER BY ((base.h)::double precision)) FILTER (WHERE ((base.status = 'Sold'::text) AND (base.h > (0)::numeric))))::numeric AS q1,
            (percentile_cont((0.75)::double precision) WITHIN GROUP (ORDER BY ((base.h)::double precision)) FILTER (WHERE ((base.status = 'Sold'::text) AND (base.h > (0)::numeric))))::numeric AS q3,
            count(*) FILTER (WHERE ((base.status = 'Sold'::text) AND (base.h > (0)::numeric))) AS n_sold,
            max(base.h) FILTER (WHERE (base.status = 'Sold'::text)) AS max_h
           FROM base
          GROUP BY base.artist_id
        ), yearly AS (
         SELECT base.artist_id,
            base.yr,
            (percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((base.h)::double precision)))::numeric AS ymed,
            count(*) AS yn
           FROM base
          WHERE ((base.status = 'Sold'::text) AND (base.h > (0)::numeric))
          GROUP BY base.artist_id, base.yr
        ), yearly2 AS (
         SELECT y.artist_id,
            y.yr,
            y.ymed,
            y.yn,
            max(y.yr) OVER (PARTITION BY y.artist_id) AS max_yr
           FROM yearly y
        ), cagr AS (
         SELECT yearly2.artist_id,
            count(*) AS n_years,
            min(yearly2.yn) AS min_yn,
            min(yearly2.yr) AS y0,
            max(yearly2.yr) AS y1,
            (array_agg(yearly2.ymed ORDER BY yearly2.yr))[1] AS med_first,
            (array_agg(yearly2.ymed ORDER BY yearly2.yr DESC))[1] AS med_last,
            count(*) FILTER (WHERE (yearly2.yr >= (yearly2.max_yr - 4))) AS n_years5,
            min(yearly2.yn) FILTER (WHERE (yearly2.yr >= (yearly2.max_yr - 4))) AS min_yn5,
            min(yearly2.yr) FILTER (WHERE (yearly2.yr >= (yearly2.max_yr - 4))) AS y0_5,
            max(yearly2.yr) FILTER (WHERE (yearly2.yr >= (yearly2.max_yr - 4))) AS y1_5,
            (array_agg(yearly2.ymed ORDER BY yearly2.yr) FILTER (WHERE (yearly2.yr >= (yearly2.max_yr - 4))))[1] AS med_first5,
            (array_agg(yearly2.ymed ORDER BY yearly2.yr DESC) FILTER (WHERE (yearly2.yr >= (yearly2.max_yr - 4))))[1] AS med_last5
           FROM yearly2
          GROUP BY yearly2.artist_id
        )
 SELECT a.artist_id,
    round(a.median_uk_hammer_gbp) AS median_uk_hammer_gbp,
    round((a.exit_median / NULLIF(a.regional_median, (0)::numeric)), 2) AS exit_vs_regional_spread,
    round((a.exit_median / NULLIF(a.regional_median, (0)::numeric)), 2) AS arb_edge_raw,
    a.n_exit_strong,
    a.n_exit_strong AS exit_strong_n,
    a.n_buy_regional,
    (a.n_exit_strong + a.n_buy_regional) AS n_uk_auto_oil,
    round(a.buy_regional_realisation, 2) AS buy_regional_realisation,
    round(a.in_zone_realisation, 2) AS in_zone_realisation,
    round(a.in_zone_realisation, 2) AS median_realisation,
        CASE
            WHEN ((a.sold_uk + a.ns_uk) > 0) THEN round(((100.0 * (a.sold_uk)::numeric) / ((a.sold_uk + a.ns_uk))::numeric))
            ELSE NULL::numeric
        END AS sell_through_pct,
    false AS spread_trusted,
    (a.n_exit_strong < 8) AS thin_exit_flag,
    (
        CASE
            WHEN ((a.n_exit_strong >= 8) AND (a.n_buy_regional >= 8)) THEN 'High'::text
            WHEN (a.n_buy_regional >= 5) THEN 'Med'::text
            ELSE 'Low'::text
        END)::confidence_t AS data_confidence,
        CASE
            WHEN (a.n_exit_strong < 8) THEN 'WATCH'::text
            ELSE 'SELECTIVE'::text
        END AS arb_read,
        CASE
            WHEN ((a.n_exit_strong >= 8) AND (a.buy_regional_realisation < (1)::numeric)) THEN 'Unconfirmed'::text
            WHEN (a.buy_regional_realisation < (1)::numeric) THEN 'Thin'::text
            ELSE 'None'::text
        END AS buy_edge_flag,
    (
        CASE
            WHEN ((l.n_sold < 8) OR (w.n_recent < 3) OR (w.med_recent IS NULL)) THEN 'Unknown'::text
            WHEN (w.med_recent < l.q1) THEN 'Cheap'::text
            WHEN (w.med_recent > l.q3) THEN 'Rich'::text
            ELSE 'Fair'::text
        END)::level_t AS level_read,
    (
        CASE
            WHEN ((w.n_recent < 5) OR (w.n_prior < 5) OR (w.med_prior IS NULL) OR (w.med_prior = (0)::numeric)) THEN 'Unknown'::text
            WHEN ((w.med_recent / w.med_prior) >= 1.15) THEN 'Up'::text
            WHEN ((w.med_recent / w.med_prior) <= 0.87) THEN 'Down'::text
            ELSE 'Flat'::text
        END)::trend_t AS trend_read,
        CASE
            WHEN ((c.n_years5 >= 3) AND (c.min_yn5 >= 3) AND (c.y1_5 > c.y0_5) AND (c.med_first5 > (0)::numeric)) THEN round((power((c.med_last5 / c.med_first5), (1.0 / ((c.y1_5 - c.y0_5))::numeric)) - (1)::numeric), 4)
            ELSE NULL::numeric
        END AS price_cagr_5y,
        CASE
            WHEN ((c.n_years >= 4) AND (c.min_yn >= 3) AND (c.y1 > c.y0) AND (c.med_first > (0)::numeric)) THEN round((power((c.med_last / c.med_first), (1.0 / ((c.y1 - c.y0))::numeric)) - (1)::numeric), 4)
            ELSE NULL::numeric
        END AS price_cagr_full,
    NULL::text AS anchor_id,
    NULL::numeric AS vs_anchor_ratio,
    NULL::integer AS matched_n,
    NULL::numeric AS matched_spread,
        CASE
            WHEN ((w.off_rec < 5) OR (w.off_pri < 5) OR (w.off_pri = 0)) THEN NULL::text
            WHEN ((((w.s_rec)::numeric / (w.off_rec)::numeric) - ((w.s_pri)::numeric / (w.off_pri)::numeric)) >= 0.10) THEN 'Up'::text
            WHEN ((((w.s_rec)::numeric / (w.off_rec)::numeric) - ((w.s_pri)::numeric / (w.off_pri)::numeric)) <= '-0.10'::numeric) THEN 'Down'::text
            ELSE 'Flat'::text
        END AS sell_through_trend,
    now() AS updated_at,
    (l.max_h > (10000)::numeric) AS ceiling_breach
   FROM (((agg a
     LEFT JOIN win w ON ((w.artist_id = a.artist_id)))
     LEFT JOIN lvl l ON ((l.artist_id = a.artist_id)))
     LEFT JOIN cagr c ON ((c.artist_id = a.artist_id)));
CREATE OR REPLACE VIEW public.artist_zone_fitness WITH (security_invoker = on) AS  WITH z AS (
         SELECT comps.artist_id,
            count(*) FILTER (WHERE ((comps.status = 'Sold'::text) AND (comps.in_zone = 'In'::text))) AS n_in,
            count(*) FILTER (WHERE ((comps.status = 'Sold'::text) AND (comps.in_zone <> 'In'::text))) AS n_out,
            count(*) FILTER (WHERE ((comps.status = ANY (ARRAY['Sold'::text, 'Not_Sold'::text])) AND (comps.in_zone = 'In'::text))) AS off_in,
            count(*) FILTER (WHERE ((comps.status = ANY (ARRAY['Sold'::text, 'Not_Sold'::text])) AND (comps.in_zone <> 'In'::text))) AS off_out,
            (percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((comps.realisation)::double precision)) FILTER (WHERE ((comps.status = 'Sold'::text) AND (comps.in_zone = 'In'::text) AND (comps.est_mid_gbp >= (200)::numeric))))::numeric AS real_in,
            (percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((comps.realisation)::double precision)) FILTER (WHERE ((comps.status = 'Sold'::text) AND (comps.in_zone <> 'In'::text) AND (comps.est_mid_gbp >= (200)::numeric))))::numeric AS real_out
           FROM comps
          WHERE ((comps.authorship = 'Autograph'::text) AND (comps.include_in_stats = 'Y'::text) AND (comps.medium_class = 'Oil'::text) AND (comps.geo_resolved = 'UK'::text))
          GROUP BY comps.artist_id
        ), p AS (
         SELECT z.artist_id,
            z.n_in,
            z.n_out,
            round(((100.0 * (z.n_in)::numeric) / (NULLIF(z.off_in, 0))::numeric)) AS st_in,
            round(((100.0 * (z.n_out)::numeric) / (NULLIF(z.off_out, 0))::numeric)) AS st_out,
            round((((100.0 * (z.n_in)::numeric) / (NULLIF(z.off_in, 0))::numeric) - ((100.0 * (z.n_out)::numeric) / (NULLIF(z.off_out, 0))::numeric)), 1) AS st_premium_pp,
            round(z.real_in, 2) AS real_in,
            round(z.real_out, 2) AS real_out,
            round((z.real_in - z.real_out), 2) AS real_premium
           FROM z
        )
 SELECT artist_id,
    n_in,
    n_out,
    st_in,
    st_out,
    st_premium_pp,
    real_in,
    real_out,
    real_premium,
        CASE
            WHEN ((n_in >= 10) AND (n_out >= 10)) THEN 'robust'::text
            ELSE 'thin'::text
        END AS zone_conf,
        CASE
            WHEN ((n_in < 5) OR (n_out < 5)) THEN 'Untestable'::text
            WHEN ((st_premium_pp >= (5)::numeric) AND (COALESCE(real_premium, (0)::numeric) >= (0)::numeric)) THEN 'Pays'::text
            WHEN ((st_premium_pp >= (5)::numeric) AND (COALESCE(real_premium, (0)::numeric) < (0)::numeric)) THEN 'Liquidity_only'::text
            WHEN ((st_premium_pp < (5)::numeric) AND (COALESCE(real_premium, (0)::numeric) >= 0.10)) THEN 'Price_only'::text
            WHEN (st_premium_pp <= ('-5'::integer)::numeric) THEN 'Inverted'::text
            ELSE 'Neutral'::text
        END AS zone_fitness
   FROM p;
CREATE OR REPLACE VIEW public.comps_timeseries AS  SELECT artist_id,
    (EXTRACT(year FROM sale_date))::integer AS period_year,
    vtype_resolved AS venue_type,
    medium_class,
    count(*) FILTER (WHERE ((status = 'Sold'::text) AND (hammer_equiv_gbp > (0)::numeric))) AS n,
    round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((hammer_equiv_gbp)::double precision)) FILTER (WHERE ((status = 'Sold'::text) AND (hammer_equiv_gbp > (0)::numeric))))::numeric) AS median_hammer_gbp,
    round(avg(hammer_equiv_gbp) FILTER (WHERE ((status = 'Sold'::text) AND (hammer_equiv_gbp > (0)::numeric)))) AS mean_hammer_gbp,
    round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((realisation)::double precision)) FILTER (WHERE ((status = 'Sold'::text) AND (est_mid_gbp >= (200)::numeric) AND (realisation IS NOT NULL))))::numeric, 2) AS median_realisation,
        CASE
            WHEN (count(*) FILTER (WHERE (status = ANY (ARRAY['Sold'::text, 'Not_Sold'::text]))) >= 4) THEN round(((100.0 * (count(*) FILTER (WHERE (status = 'Sold'::text)))::numeric) / (count(*) FILTER (WHERE (status = ANY (ARRAY['Sold'::text, 'Not_Sold'::text]))))::numeric))
            ELSE NULL::numeric
        END AS sell_through_pct
   FROM comps
  WHERE ((authorship = 'Autograph'::text) AND (include_in_stats = 'Y'::text) AND (vtype_resolved = ANY (ARRAY['Exit_Strong'::text, 'Buy_Regional'::text, 'Straddle'::text, 'Foreign'::text])) AND (medium_class = ANY (ARRAY['Oil'::text, 'Watercolour'::text])))
  GROUP BY artist_id, (EXTRACT(year FROM sale_date)), vtype_resolved, medium_class;
CREATE OR REPLACE VIEW public.desk_params_current AS  SELECT params_id,
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
    created_at
   FROM desk_params
  ORDER BY effective_from DESC
 LIMIT 1;
CREATE OR REPLACE VIEW public.vocab_enum AS  SELECT (t.typname)::text AS enum_name,
    (e.enumlabel)::text AS value,
    (e.enumsortorder)::integer AS sort_order
   FROM ((pg_type t
     JOIN pg_enum e ON ((e.enumtypid = t.oid)))
     JOIN pg_namespace n ON ((n.oid = t.typnamespace)))
  WHERE (n.nspname = 'public'::name);
CREATE OR REPLACE VIEW public.book_screen WITH (security_invoker = on) AS  SELECT a.artist_id,
    a.display_name,
    a.dates,
    a.play_type,
    a.tier,
    a.arr_status,
    a.palette_pref,
    a.paper_sleeve,
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
    (COALESCE(f.open_flags, (0)::bigint))::integer AS open_flags,
    c.price_cagr_full,
    c.sell_through_trend,
    c.ceiling_breach,
    z.zone_fitness,
    z.zone_conf,
    z.st_premium_pp AS zone_sellthrough_premium_pp
   FROM (((artists a
     LEFT JOIN comps_rollup c ON ((c.artist_id = a.artist_id)))
     LEFT JOIN artist_zone_fitness z ON ((z.artist_id = a.artist_id)))
     LEFT JOIN ( SELECT notes.artist_id,
            count(*) AS open_flags
           FROM notes
          WHERE ((notes.note_type = 'Flag'::note_type_t) AND (notes.action_status = 'Open'::action_status_t))
          GROUP BY notes.artist_id) f ON ((f.artist_id = a.artist_id)))
  WHERE a.tracked;
CREATE OR REPLACE VIEW public.artist_360 WITH (security_invoker = on) AS  SELECT a.artist_id,
    a.display_name,
    a.dates,
    a.tier,
    a.arr_status,
    a.play_type,
    a.palette_pref,
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
    (COALESCE(f.open_flags, (0)::bigint))::integer AS open_flags,
    c.level_read,
    c.price_cagr_full,
    c.sell_through_trend,
    c.ceiling_breach,
    z.zone_fitness,
    z.zone_conf
   FROM (((artists a
     LEFT JOIN comps_rollup c ON ((c.artist_id = a.artist_id)))
     LEFT JOIN artist_zone_fitness z ON ((z.artist_id = a.artist_id)))
     LEFT JOIN ( SELECT notes.artist_id,
            count(*) AS open_flags
           FROM notes
          WHERE ((notes.note_type = 'Flag'::note_type_t) AND (notes.action_status = 'Open'::action_status_t))
          GROUP BY notes.artist_id) f ON ((f.artist_id = a.artist_id)));

-- ==================== 8. RLS ENABLE ====================
ALTER TABLE public.artist_desk_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comps_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comps_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desk_params ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocab_note_tag ENABLE ROW LEVEL SECURITY;

-- ==================== 9. RLS POLICIES ====================
CREATE POLICY comps_stage_all ON public.comps_stage AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_artist_desk_config ON public.artist_desk_config AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_budget ON public.budget AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_comps ON public.comps AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_comps_raw ON public.comps_raw AS PERMISSIVE FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());
CREATE POLICY owner_all_desk_params ON public.desk_params AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_lots ON public.lots AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_notes ON public.notes AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_positions ON public.positions AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_tags ON public.note_tags AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY owner_all_triggers ON public.triggers AS PERMISSIVE FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());
CREATE POLICY read_artists ON public.artists AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY read_vocab ON public.vocab_note_tag AS PERMISSIVE FOR SELECT TO authenticated USING (true);

-- ============ OPTIONAL cleanup: drop 11 orphaned legacy enums ============
-- Uncomment after confirming no function/policy body references them.
-- DROP TYPE IF EXISTS public.action_status, public.arr_status, public.artist_tier,
--   public.confidence_level, public.data_confidence, public.decision_kind,
--   public.note_scope, public.note_type, public.palette_pref, public.play_type,
--   public.priority_level;

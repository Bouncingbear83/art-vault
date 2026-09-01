-- 20260901110000_audit_desk_params_writes.sql
--
-- Phase 1 of the anti-drift guard for desk_params. Observe-only: nothing is
-- blocked, nothing existing can break. This exists because the current RLS
-- policy on desk_params (owner_all_desk_params, FOR ALL TO authenticated,
-- USING(true) WITH CHECK(true)) permits any authenticated write, and there is
-- no visibility into whether the Lovable frontend ever writes desk_params
-- directly rather than through ratify_desk_params / apply_sleeve_multiple.
-- Enforcing a revoke without knowing that first risks silently breaking the
-- app; this migration answers the question instead of guessing.
--
-- How provenance is captured. Role alone cannot distinguish the two RPCs from
-- a raw client write: ratify_desk_params is SECURITY DEFINER, so its inserts
-- already show a different current_user, but apply_sleeve_multiple is still
-- SECURITY INVOKER, so its inserts look identical to a direct authenticated
-- write by role. Both RPCs now stamp a transaction-local setting immediately
-- before their INSERT; the trigger reads it. This is unambiguous regardless
-- of security mode and needs no change to either function's actual logic.
--
-- Plan: leave this running for one to two weeks of normal use, then inspect
-- public.desk_params_write_audit. If every row's source is ratify_desk_params
-- or apply_sleeve_multiple, Phase 2 (revoke direct write access, harden
-- apply_sleeve_multiple to SECURITY DEFINER) is safe to apply. If anything
-- else shows up, that call site needs fixing before Phase 2, not after.

-- ---------------------------------------------------------------------------
-- 1. audit table. RLS on, SELECT only for authenticated: only the SECURITY
--    DEFINER trigger function below can write to it, so a stray direct write
--    to desk_params can't also forge its own "legitimate" audit entry.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.desk_params_write_audit (
  audit_id   bigint generated always as identity primary key,
  logged_at  timestamptz not null default now(),
  source     text not null default 'DIRECT_OR_UNKNOWN',
  db_role    text not null default current_user,
  params_id  uuid,
  note       text
);

ALTER TABLE public.desk_params_write_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS read_desk_params_write_audit ON public.desk_params_write_audit;

CREATE POLICY read_desk_params_write_audit ON public.desk_params_write_audit
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 2. trigger function, SECURITY DEFINER so it can write the audit table
--    regardless of whoever's write on desk_params fired it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._log_desk_params_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.desk_params_write_audit (source, db_role, params_id, note)
  VALUES (COALESCE(current_setting('app.write_source', true), 'DIRECT_OR_UNKNOWN'),
          current_user, NEW.params_id, NEW.note);
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS desk_params_write_audit_trg ON public.desk_params;

CREATE TRIGGER desk_params_write_audit_trg
  AFTER INSERT ON public.desk_params
  FOR EACH ROW EXECUTE FUNCTION public._log_desk_params_write();

-- ---------------------------------------------------------------------------
-- 3. stamp the source in both current write paths. One line added to each,
--    set_config(..., true) is transaction-local (is_local=true), so it never
--    leaks to another session or another statement in the same session.
--    Every other line in both functions is unchanged from what is live today.
-- ---------------------------------------------------------------------------
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

  PERFORM set_config('app.write_source', 'ratify_desk_params', true);

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
END
$function$;

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

  PERFORM set_config('app.write_source', 'apply_sleeve_multiple', true);

  INSERT INTO public.desk_params (
    collector_discount_firm, collector_discount_stretch, stale_haircut, remote_haircut,
    bp_pct_default, vat_premium, arr_rate, n_gate, homogeneity_threshold, recency_cutoff,
    note, sleeve_ceiling_multiple, band_n_gate, band_factor_cap, band_floor_gbp, max_work_gbp
  )
  SELECT collector_discount_firm, collector_discount_stretch, stale_haircut, remote_haircut,
         bp_pct_default, vat_premium, arr_rate, n_gate, homogeneity_threshold, recency_cutoff,
         'sleeve_ceiling_multiple -> ' || p_multiple::text, p_multiple,
         band_n_gate, band_factor_cap, band_floor_gbp, max_work_gbp
  FROM public.desk_params_current;

  UPDATE public.artist_desk_config adc
  SET paper_ceiling_gbp = round(adc.inzone_finished_wc_median_gbp * p_multiple / 50) * 50
  WHERE adc.inzone_finished_wc_median_gbp IS NOT NULL;

  SELECT p_multiple INTO v_new;
  RETURN v_new;
END;
$function$;

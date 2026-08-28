-- 20260828160000_extend_ratify_desk_params_band_args.sql
--
-- This is a CHANGE, not a capture. It must also be run against live.
--
-- Problem. ratify_desk_params only ever accepted the two collector discounts
-- and the band floor. band_n_gate and band_factor_cap were copied forward
-- unconditionally from desk_params_current, with no way to change them through
-- the safe path. The only way to move band_factor_cap was a hand-written INSERT
-- that copies all sixteen columns itself, and that is exactly the path that
-- reset it to 1.5 once already (2026-08-27 correction to 2.0, note on file).
-- apply_sleeve_multiple had the same defect for a different pair of columns,
-- fixed separately in 20260828150100.
--
-- Fix. Two new trailing parameters, both optional and both NULL by default:
--   p_band_n_gate     integer  default null
--   p_band_factor_cap numeric  default null
-- NULL means "carry the current value forward", so every existing call site
-- that passes the original four positional arguments keeps working unchanged
-- and continues to carry both values forward exactly as before. Passing a
-- value overrides just that one parameter; the other three (sleeve multiple,
-- band_n_gate or band_factor_cap, band_floor_gbp) still carry forward from
-- desk_params_current untouched. This closes the gap without adding a second
-- function or a raw-INSERT escape hatch.
--
-- Range checks on the two new parameters are a judgement call, not derived
-- from the mandate: band_n_gate > 0 (a sample-size gate of zero or fewer is
-- meaningless) and band_factor_cap >= 1 (a cap below 1 would clamp every band
-- factor to a discount, which is not what this parameter is for). Flagging
-- these as new guards rather than asserting they were already implied.
--
-- CREATE OR REPLACE, full body: no ALTER can change a body, and OR REPLACE
-- resets proconfig, so the SET search_path clause from 20260828130000 is
-- restated here or it would be silently lost.
--
-- DROP the four-argument overload first. Postgres identifies a function by
-- name plus argument list, so CREATE OR REPLACE with two new parameters does
-- not replace the old signature, it adds a second overload beside it. Verified
-- on a rebuild: with both present, a call using the original four positional
-- arguments raised "function ... is not unique" rather than falling through to
-- the new default parameters, which is the opposite of the backward
-- compatibility this migration is meant to provide. Dropping the old overload
-- first is what makes the four-argument call site keep working unchanged.

DROP FUNCTION IF EXISTS public.ratify_desk_params(numeric, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.ratify_desk_params(
  p_discount_firm    numeric,
  p_discount_stretch  numeric,
  p_band_floor_gbp   numeric,
  p_note             text,
  p_band_n_gate      integer default null,
  p_band_factor_cap  numeric default null
)
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

  INSERT INTO public.desk_params (
    effective_from, collector_discount_firm, collector_discount_stretch,
    stale_haircut, remote_haircut, bp_pct_default, vat_premium, arr_rate,
    n_gate, homogeneity_threshold, recency_cutoff,
    sleeve_ceiling_multiple, band_n_gate, band_factor_cap, band_floor_gbp, note)
  SELECT now(), p_discount_firm, p_discount_stretch,
    c.stale_haircut, c.remote_haircut, c.bp_pct_default, c.vat_premium, c.arr_rate,
    c.n_gate, c.homogeneity_threshold, c.recency_cutoff,
    c.sleeve_ceiling_multiple,
    COALESCE(p_band_n_gate, c.band_n_gate),
    COALESCE(p_band_factor_cap, c.band_factor_cap),
    p_band_floor_gbp, btrim(p_note)
  FROM public.desk_params_current c
  RETURNING params_id INTO v_new;

  RETURN v_new;
END $function$;

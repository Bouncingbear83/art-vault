-- 20260828120300_capture_ratify_desk_params.sql
--
-- Parity capture. Written from live catalogue output on 2026-08-28, not from
-- documentation and not from the schema baseline.
-- Source: pg_get_functiondef(oid). SECURITY DEFINER as live. No GRANT emitted: the live
-- ACL matches Supabase default privileges and the baseline emits no grants.

CREATE OR REPLACE FUNCTION public.ratify_desk_params(p_discount_firm numeric, p_discount_stretch numeric, p_band_floor_gbp numeric, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
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

  INSERT INTO public.desk_params (
    effective_from, collector_discount_firm, collector_discount_stretch,
    stale_haircut, remote_haircut, bp_pct_default, vat_premium, arr_rate,
    n_gate, homogeneity_threshold, recency_cutoff,
    sleeve_ceiling_multiple, band_n_gate, band_factor_cap, band_floor_gbp, note)
  SELECT CURRENT_DATE, p_discount_firm, p_discount_stretch,
    c.stale_haircut, c.remote_haircut, c.bp_pct_default, c.vat_premium, c.arr_rate,
    c.n_gate, c.homogeneity_threshold, c.recency_cutoff,
    c.sleeve_ceiling_multiple, c.band_n_gate, c.band_factor_cap,
    p_band_floor_gbp, btrim(p_note)
  FROM public.desk_params_current c
  RETURNING params_id INTO v_new;

  RETURN v_new;
END $function$;

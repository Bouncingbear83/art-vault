-- 20260828150100_fix_sleeve_rpc_param_carry_forward.sql
--
-- This is a CHANGE, not a capture. It must also be run against live.
--
-- Defect. apply_sleeve_multiple clones the current params row into a new one,
-- but its INSERT column list stops at sleeve_ceiling_multiple. band_n_gate,
-- band_factor_cap and band_floor_gbp are omitted, so the new row takes each
-- column DEFAULT instead of the value in force. band_factor_cap defaults to 1.5
-- and live currently runs 2.0, so moving the sleeve slider on /desk/params
-- silently reverted the band cap to 1.5 and undid the Brangwyn / Pritchett /
-- Stanfield re-derivation. Nothing on screen would have said so.
--
-- Reproduced on a rebuild: cap 2.0 before the call, 1.5 after.
--
-- This is the desk_params append-never-mutate trap firing through a code path
-- rather than through a hand-written INSERT. The fix is to carry every parameter
-- forward explicitly. Any future parameter added to desk_params must be added to
-- both lists here and in ratify_desk_params, or it will reset the same way.
--
-- Behaviour is otherwise unchanged: same range check, same note, same ceiling
-- recompute, same return value. History is still preserved by append.

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
    note, sleeve_ceiling_multiple, band_n_gate, band_factor_cap, band_floor_gbp
  )
  SELECT collector_discount_firm, collector_discount_stretch, stale_haircut, remote_haircut,
         bp_pct_default, vat_premium, arr_rate, n_gate, homogeneity_threshold, recency_cutoff,
         'sleeve_ceiling_multiple -> ' || p_multiple::text, p_multiple,
         band_n_gate, band_factor_cap, band_floor_gbp
  FROM public.desk_params_current;

  -- recompute every sleeve ceiling from the new lever
  UPDATE public.artist_desk_config adc
  SET paper_ceiling_gbp = round(adc.inzone_finished_wc_median_gbp * p_multiple / 50) * 50
  WHERE adc.inzone_finished_wc_median_gbp IS NOT NULL;

  SELECT p_multiple INTO v_new;
  RETURN v_new;
END;
$function$;

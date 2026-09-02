-- ratify_desk_params: make p_band_floor_gbp optional and copy-forward.
--
-- Before this change p_band_floor_gbp was required and never coalesced, so
-- every ratification had to restate the band floor. A caller passing a stale
-- value moved it silently while the other eight economic and governance
-- params copied forward correctly. Making it optional brings it in line with
-- p_band_n_gate, p_band_factor_cap and p_max_work_gbp.
--
-- The argument list changes, so Postgres would create a second overload
-- rather than replace. The old signature is dropped first. Verified
-- 2026-09-02 that no application code calls this RPC: only migrations
-- 20260828120300 and 20260828160000 reference it.

drop function if exists public.ratify_desk_params(numeric, numeric, numeric, text, integer, numeric, numeric);

create or replace function public.ratify_desk_params(
  p_discount_firm numeric,
  p_discount_stretch numeric,
  p_note text,
  p_band_floor_gbp numeric default null,
  p_band_n_gate integer default null,
  p_band_factor_cap numeric default null,
  p_max_work_gbp numeric default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_new uuid;
begin
  if p_note is null or btrim(p_note) = '' then
    raise exception 'A rationale is required to ratify params.';
  end if;
  if p_discount_firm <= 0 or p_discount_firm >= 1
     or p_discount_stretch <= 0 or p_discount_stretch >= 1 then
    raise exception 'Discounts must sit strictly between 0 and 1.';
  end if;
  if p_discount_stretch >= p_discount_firm then
    raise exception 'Stretch discount must be tighter than firm.';
  end if;
  if p_band_n_gate is not null and p_band_n_gate <= 0 then
    raise exception 'band_n_gate must be a positive integer.';
  end if;
  if p_band_factor_cap is not null and p_band_factor_cap < 1 then
    raise exception 'band_factor_cap must be at least 1.';
  end if;
  if p_max_work_gbp is not null and p_max_work_gbp <= 0 then
    raise exception 'max_work_gbp must be positive.';
  end if;
  if p_band_floor_gbp is not null and p_band_floor_gbp < 0 then
    raise exception 'band_floor_gbp cannot be negative.';
  end if;

  perform set_config('app.write_source', 'ratify_desk_params', true);

  insert into public.desk_params (
    effective_from, collector_discount_firm, collector_discount_stretch,
    stale_haircut, remote_haircut, bp_pct_default, vat_premium, arr_rate,
    n_gate, homogeneity_threshold, recency_cutoff,
    sleeve_ceiling_multiple, band_n_gate, band_factor_cap, band_floor_gbp,
    max_work_gbp, note)
  select now(), p_discount_firm, p_discount_stretch,
    c.stale_haircut, c.remote_haircut, c.bp_pct_default, c.vat_premium, c.arr_rate,
    c.n_gate, c.homogeneity_threshold, c.recency_cutoff,
    c.sleeve_ceiling_multiple,
    coalesce(p_band_n_gate, c.band_n_gate),
    coalesce(p_band_factor_cap, c.band_factor_cap),
    coalesce(p_band_floor_gbp, c.band_floor_gbp),
    coalesce(p_max_work_gbp, c.max_work_gbp),
    btrim(p_note)
  from public.desk_params_current c
  returning params_id into v_new;

  return v_new;
end
$function$;

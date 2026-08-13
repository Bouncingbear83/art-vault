-- Existing views currently default to security_invoker; make it explicit to satisfy the linter.
ALTER VIEW public.comps_rollup SET (security_invoker = on);
ALTER VIEW public.comps_timeseries SET (security_invoker = on);

-- comps table (written by the new /api/public/comps route)
ALTER TABLE public.comps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_comps" ON public.comps FOR ALL TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());
GRANT ALL ON public.comps TO service_role;

-- comps_raw table (legacy ingestion staging)
ALTER TABLE public.comps_raw ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_comps_raw" ON public.comps_raw FOR ALL TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());
GRANT ALL ON public.comps_raw TO service_role;

-- triggers table (buy triggers / walkaways)
ALTER TABLE public.triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_triggers" ON public.triggers FOR ALL TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());
GRANT ALL ON public.triggers TO service_role;
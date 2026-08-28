-- 20260828120000_capture_size_band_defs.sql
--
-- Parity capture. Written from live catalogue output on 2026-08-28, not from
-- documentation and not from the schema baseline.
-- Source: information_schema.columns, pg_constraint, pg_indexes, pg_policies, json_agg of the table.

CREATE TABLE IF NOT EXISTS public.size_band_defs (
  band_set   text NOT NULL DEFAULT 'default'::text,
  band_label text NOT NULL,
  lo         numeric NOT NULL,
  hi         numeric,
  sort_order integer NOT NULL,
  note       text,
  CONSTRAINT size_band_defs_pkey PRIMARY KEY (band_set, band_label)
);

ALTER TABLE public.size_band_defs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_all_size_band_defs ON public.size_band_defs;

CREATE POLICY owner_all_size_band_defs ON public.size_band_defs
  AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.size_band_defs (band_set, band_label, lo, hi, sort_order, note) VALUES
  ('default', '<45',    0,   45, 1, NULL),
  ('default', '45-60', 45,   60, 2, NULL),
  ('default', '60-90', 60,   90, 3, NULL),
  ('default', '90+',   90, NULL, 4, NULL)
ON CONFLICT (band_set, band_label) DO NOTHING;

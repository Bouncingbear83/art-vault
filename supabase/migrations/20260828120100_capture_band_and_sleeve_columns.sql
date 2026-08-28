-- 20260828120100_capture_band_and_sleeve_columns.sql
--
-- Parity capture. Written from live catalogue output on 2026-08-28, not from
-- documentation and not from the schema baseline.
-- Source: information_schema.columns. desk_params is append-never-mutate: columns are
-- added with DEFAULT; no params row is inserted.

ALTER TABLE public.desk_params
  ADD COLUMN IF NOT EXISTS sleeve_ceiling_multiple numeric NOT NULL DEFAULT 0.45;

ALTER TABLE public.desk_params
  ADD COLUMN IF NOT EXISTS band_n_gate integer NOT NULL DEFAULT 5;

ALTER TABLE public.desk_params
  ADD COLUMN IF NOT EXISTS band_factor_cap numeric NOT NULL DEFAULT 1.5;

ALTER TABLE public.desk_params
  ADD COLUMN IF NOT EXISTS band_floor_gbp numeric DEFAULT 2000;

ALTER TABLE public.budget
  ADD COLUMN IF NOT EXISTS target_works integer;

ALTER TABLE public.artist_desk_config
  ADD COLUMN IF NOT EXISTS inzone_finished_wc_median_gbp numeric;

ALTER TABLE public.artist_desk_config
  ADD COLUMN IF NOT EXISTS band_set text NOT NULL DEFAULT 'default'::text;

ALTER TABLE public.artist_desk_config
  ADD COLUMN IF NOT EXISTS palette_avoid text[];

-- 20260825120000_add-lots-candidate-ledger.sql
-- Lot Desk v0.6+ : the scored-candidate ledger.
--
-- Sibling to public.positions (owned works). A lot is scored (by score_lot, the
-- manual fallback form, or the nightly radar) and lands here as an OPEN candidate.
-- On a win it graduates to positions and its status flips to 'won'. This is the
-- durable object that was previously missing: scored lots only lived as a Lot note
-- that expired at sale_date + 1d, so nothing survived to render beside grain.
--
-- DELIBERATELY STANDALONE. Depends only on public.artists. It does NOT reference
-- comps_rollup / artist_360, whose LIVE definitions have drifted ahead of the repo
-- migrations (Debt Register RESIDUAL 1: repo still defines comps_rollup as the old
-- base table). Grain context is composed in the app by reading artist_360 alongside
-- this table, so a rebuild-from-migrations can never couple lots to a stale view.
--
-- artist_id is the text slug the live code uses everywhere (e.g. 'james-kay');
-- FK to artists(artist_id) mirrors comps/positions. params_id, lot_note_id and
-- position_id are soft links (no FK) to avoid coupling to tables/types this repo
-- cannot see; see the manifest for the optional hardening once their DDL is in-repo.

CREATE TABLE IF NOT EXISTS public.lots (
  lot_id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_key                  text NOT NULL UNIQUE,          -- artist | norm-title | venue | sale_date; one live row per lot (upsert)
  artist_id                 text NOT NULL REFERENCES public.artists(artist_id) ON DELETE CASCADE,

  -- provenance / lifecycle -----------------------------------------------------
  captured_by               text NOT NULL DEFAULT 'claude'
                              CHECK (captured_by IN ('claude','manual','radar')),
  source_ref                text,                          -- listing URL or MutualArt dump ref
  classification_confidence numeric,                       -- radar/LLM subject+palette stamp (0-1); null for human capture
  status                    text NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','monitor','skipped','won','lost','expired')),

  -- input contract (mandate v7.2 spec §2: catalogue + judgement) ---------------
  title                     text NOT NULL,
  authorship                text NOT NULL DEFAULT 'Autograph',
  medium_raw                text,
  medium_class              text,
  subject                   text,
  palette                   text,
  palette_kw_only           boolean NOT NULL DEFAULT false, -- §C keyword-only palette call flagged
  longest_cm                numeric,
  est_low                   numeric,
  est_high                  numeric,
  currency                  text,
  venue                     text,
  sale_date                 date,
  in_zone                   text CHECK (in_zone IN ('In','Skip')), -- resolved, not captured

  -- hard human gates (never Claude-set) ---------------------------------------
  strong_venue_candidate    boolean NOT NULL DEFAULT false,
  quality_delta_input       numeric,                       -- null => scorer holds 1.0, "median-quality assumed"
  quality_override_reason   text,
  taste_ok                  boolean,                       -- null until the human sets the gate
  condition_checked         boolean NOT NULL DEFAULT false,
  condition_note            text,
  provenance_note           text,
  sale_context              text,
  sheet_grade               text,

  -- scorer output snapshot (score.ts Decision) --------------------------------
  decision                  text CHECK (decision IN ('Buy','Skip','Monitor')),
  binding_constraint        text,
  lane                      text CHECK (lane IN ('oil','paper','pritchett-table')),
  fair_value_gbp            numeric,
  anchor_tier               text,
  anchor_rung               int,
  anchor_n                  int,
  anchor_confidence         text,
  quality_delta_value       numeric,                       -- resolved delta the bid used
  k_buy                     numeric,
  ladder_firm_gbp           numeric,
  ladder_stretch_gbp        numeric,
  ladder_tightened_gbp      numeric,
  ladder_commission_gbp     numeric,
  all_in_at_firm_gbp        numeric,
  budget_ok                 boolean,
  params_id                 text,                          -- desk_params row in force at scoring (soft link)
  flags                     text[] NOT NULL DEFAULT '{}',
  decision_json             jsonb,                         -- full LotInput + Decision, lossless audit

  -- graduation links ----------------------------------------------------------
  lot_note_id               uuid,                          -- the Lot note (I.5 body grammar)
  position_id               uuid,                          -- set on win

  scored_at                 timestamptz,                   -- when the scorer last ran
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.lots IS 'Scored buy candidates (pre-win). Graduates to positions on a win. Standalone: no dependency on the drifted comps_rollup/artist_360 views.';
COMMENT ON COLUMN public.lots.captured_by IS 'claude = §C capture from link/dump; manual = fallback form; radar = nightly Move 1 ingest.';
COMMENT ON COLUMN public.lots.quality_delta_input IS 'Human input; null means median-quality (1.0) assumed and stamped, never silently.';
COMMENT ON COLUMN public.lots.decision_json IS 'Lossless snapshot of the LotInput + score.ts Decision for audit; flattened columns are for query/render.';

-- RLS + grants (owner guard, matching every other table) ------------------------
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_lots" ON public.lots FOR ALL TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lots TO authenticated;
GRANT ALL ON public.lots TO service_role;

-- updated_at maintenance (reuses the existing trigger fn) -----------------------
CREATE TRIGGER lots_touch BEFORE UPDATE ON public.lots
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- indexes -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS lots_artist_idx    ON public.lots (artist_id);
CREATE INDEX IF NOT EXISTS lots_status_idx    ON public.lots (status);
CREATE INDEX IF NOT EXISTS lots_sale_date_idx ON public.lots (sale_date DESC);
CREATE INDEX IF NOT EXISTS lots_decision_idx  ON public.lots (decision);
CREATE INDEX IF NOT EXISTS lots_captured_idx  ON public.lots (captured_by);

-- ROLLBACK: DROP TABLE public.lots;   (cascades policy, trigger, indexes)

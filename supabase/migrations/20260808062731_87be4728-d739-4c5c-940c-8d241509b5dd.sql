-- ENUMS
CREATE TYPE public.note_type AS ENUM ('Verdict','Trigger','Flag','Observation');
CREATE TYPE public.note_scope AS ENUM ('Artist','Venue','System');
CREATE TYPE public.decision_kind AS ENUM ('Buy','Watch','Avoid','Undecided');
CREATE TYPE public.play_type AS ENUM ('Sunlit Coastal','Marine','Continental Oil','British Impressionist','Landscape','Portrait','Other');
CREATE TYPE public.confidence_level AS ENUM ('Low','Medium','High');
CREATE TYPE public.priority_level AS ENUM ('P1','P2','P3');
CREATE TYPE public.action_status AS ENUM ('Open','Actioned','Dismissed');
CREATE TYPE public.artist_tier AS ENUM ('Core','Satellite','Speculative','Retired');
CREATE TYPE public.arr_status AS ENUM ('In ARR','ARR Expired','Unknown');
CREATE TYPE public.data_confidence AS ENUM ('Thin','Adequate','Strong');
CREATE TYPE public.palette_pref AS ENUM ('Sunlit','Silvered','Tonal','High Key','Dark');

-- OWNER GUARD
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT coalesce(auth.jwt() ->> 'email', '') = 'bertbroadead@gmail.com' $$;

-- ARTISTS
CREATE TABLE public.artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  dates_text text,
  birth_year int,
  death_year int,
  nationality text,
  tier public.artist_tier NOT NULL DEFAULT 'Satellite',
  arr_status public.arr_status NOT NULL DEFAULT 'Unknown',
  play_type public.play_type,
  palette_pref public.palette_pref,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artists TO authenticated;
GRANT ALL ON public.artists TO service_role;
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_artists" ON public.artists FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

-- COMPS ROLLUP
CREATE TABLE public.comps_rollup (
  artist_id uuid PRIMARY KEY REFERENCES public.artists(id) ON DELETE CASCADE,
  median_uk_hammer_gbp numeric,
  mean_uk_hammer_gbp numeric,
  low_gbp numeric,
  high_gbp numeric,
  sell_through_pct numeric,
  n_uk_auto_oil int,
  n_lots_total int,
  last_sale_date date,
  data_confidence public.data_confidence NOT NULL DEFAULT 'Thin',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comps_rollup TO authenticated;
GRANT ALL ON public.comps_rollup TO service_role;
ALTER TABLE public.comps_rollup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_comps" ON public.comps_rollup FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

-- VOCAB
CREATE TABLE public.vocab_note_tag (
  tag text PRIMARY KEY,
  label text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 100
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vocab_note_tag TO authenticated;
GRANT ALL ON public.vocab_note_tag TO service_role;
ALTER TABLE public.vocab_note_tag ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_vocab" ON public.vocab_note_tag FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

-- NOTES
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_type public.note_type NOT NULL,
  scope public.note_scope NOT NULL,
  artist_id uuid REFERENCES public.artists(id) ON DELETE SET NULL,
  entity_key text,
  decision public.decision_kind,
  play_type public.play_type,
  confidence public.confidence_level,
  priority public.priority_level,
  action_status public.action_status NOT NULL DEFAULT 'Open',
  valid_from date NOT NULL DEFAULT current_date,
  valid_to date,
  supersedes uuid REFERENCES public.notes(id) ON DELETE SET NULL,
  source_ref text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_notes" ON public.notes FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE INDEX notes_open_flags_idx ON public.notes (note_type, action_status, priority);
CREATE INDEX notes_artist_idx ON public.notes (artist_id);

-- NOTE TAGS
CREATE TABLE public.note_tags (
  note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  tag text NOT NULL REFERENCES public.vocab_note_tag(tag) ON DELETE RESTRICT,
  PRIMARY KEY (note_id, tag)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_tags TO authenticated;
GRANT ALL ON public.note_tags TO service_role;
ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_note_tags" ON public.note_tags FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER notes_touch BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ARTIST 360 VIEW
CREATE VIEW public.artist_360 WITH (security_invoker = on) AS
SELECT
  a.id AS artist_id,
  a.name,
  a.dates_text,
  a.birth_year,
  a.death_year,
  a.nationality,
  a.tier,
  a.arr_status,
  a.play_type,
  a.palette_pref,
  c.median_uk_hammer_gbp,
  c.mean_uk_hammer_gbp,
  c.low_gbp,
  c.high_gbp,
  c.sell_through_pct,
  c.n_uk_auto_oil,
  c.n_lots_total,
  c.last_sale_date,
  c.data_confidence,
  c.updated_at AS comps_updated_at,
  coalesce(f.open_flags, 0)::int AS open_flags
FROM public.artists a
LEFT JOIN public.comps_rollup c ON c.artist_id = a.id
LEFT JOIN (
  SELECT artist_id, count(*) AS open_flags
  FROM public.notes
  WHERE note_type = 'Flag' AND action_status = 'Open'
  GROUP BY artist_id
) f ON f.artist_id = a.id;
GRANT SELECT ON public.artist_360 TO authenticated;
GRANT ALL ON public.artist_360 TO service_role;

-- SEED: vocab
INSERT INTO public.vocab_note_tag (tag, label, description, sort_order) VALUES
 ('condition','Condition','Condition or restoration concern',10),
 ('attribution','Attribution','Authorship or signature question',20),
 ('provenance','Provenance','Ownership chain',30),
 ('pricing','Pricing','Estimate or reserve behaviour',40),
 ('venue','Venue','Saleroom-specific observation',50),
 ('liquidity','Liquidity','Depth of demand / resale speed',60),
 ('subject','Subject','Subject matter preference',70),
 ('framing','Framing','Frame quality or cost',80),
 ('shipping','Shipping','Logistics and transport',90),
 ('arr','ARR','Artist resale right exposure',100);

-- SEED: artists
INSERT INTO public.artists (id, name, dates_text, birth_year, death_year, nationality, tier, arr_status, play_type, palette_pref) VALUES
 ('11111111-1111-4111-8111-111111111101','Edward Seago','1910–1974',1910,1974,'British','Core','ARR Expired','Marine','Silvered'),
 ('11111111-1111-4111-8111-111111111102','Arthur Delaney','1927–1987',1927,1987,'British','Satellite','In ARR','British Impressionist','Tonal'),
 ('11111111-1111-4111-8111-111111111103','Hendrik Willem Mesdag','1831–1915',1831,1915,'Dutch','Satellite','ARR Expired','Marine','Tonal'),
 ('11111111-1111-4111-8111-111111111104','Dorothea Sharp','1873–1955',1873,1955,'British','Core','ARR Expired','Sunlit Coastal','Sunlit'),
 ('11111111-1111-4111-8111-111111111105','Julius Olsson','1864–1942',1864,1942,'British','Core','ARR Expired','Marine','High Key'),
 ('11111111-1111-4111-8111-111111111106','Émile Vernier','1829–1887',1829,1887,'French','Speculative','ARR Expired','Continental Oil','Dark');

-- SEED: comps
INSERT INTO public.comps_rollup (artist_id, median_uk_hammer_gbp, mean_uk_hammer_gbp, low_gbp, high_gbp, sell_through_pct, n_uk_auto_oil, n_lots_total, last_sale_date, data_confidence) VALUES
 ('11111111-1111-4111-8111-111111111101',9800,14200,1800,68000,82.4,64,213,'2026-06-18','Strong'),
 ('11111111-1111-4111-8111-111111111102',2400,2950,600,9200,71.0,38,96,'2026-05-02','Adequate'),
 ('11111111-1111-4111-8111-111111111103',3100,4400,900,18000,64.5,11,44,'2026-03-27','Adequate'),
 ('11111111-1111-4111-8111-111111111104',5600,7100,1400,26000,78.9,29,84,'2026-07-09','Strong'),
 ('11111111-1111-4111-8111-111111111105',4200,6350,1100,31000,69.2,7,22,'2026-04-15','Thin'),
 ('11111111-1111-4111-8111-111111111106',1150,1480,320,4800,58.0,5,17,'2025-11-30','Thin');

-- SEED: notes
INSERT INTO public.notes (id, note_type, scope, artist_id, entity_key, decision, play_type, confidence, priority, action_status, valid_from, valid_to, source_ref, body) VALUES
 ('22222222-2222-4222-8222-222222222201','Flag','Artist','11111111-1111-4111-8111-111111111105',NULL,NULL,'Marine','Medium','P1','Open','2026-07-20','2026-09-30','Bonhams Marine 12 Aug, lot 44','Thin UK oil sample (n=7) — do not size up until at least three further hammer prints land.'),
 ('22222222-2222-4222-8222-222222222202','Flag','Venue',NULL,'Tennants Leyburn',NULL,NULL,'High','P2','Open','2026-07-28','2026-10-15','Post-sale invoice 2026-1187','Buyer premium moved to 27% inclusive — rebuild the landed-cost assumption before bidding again.'),
 ('22222222-2222-4222-8222-222222222203','Flag','Artist','11111111-1111-4111-8111-111111111102',NULL,NULL,'British Impressionist','Medium','P3','Open','2026-06-11',NULL,'Condition report, Capes Dunn','Recurrent overpaint on skies in the 1970s street scenes; check under UV before every commitment.'),
 ('22222222-2222-4222-8222-222222222204','Flag','System',NULL,'FX assumption',NULL,NULL,'Low','P2','Open','2026-08-01','2026-08-31','Desk memo','EUR sourcing costs drifted 4% since the last rebuild of the continental oils lane.'),
 ('22222222-2222-4222-8222-222222222205','Flag','Artist','11111111-1111-4111-8111-111111111104',NULL,NULL,'Sunlit Coastal','High','P1','Open','2026-07-30','2026-08-20','Lyon & Turnbull 27 Aug','Two beach subjects in one sale — expect internal competition; stagger the bids or skip the weaker lot.'),
 ('22222222-2222-4222-8222-222222222206','Verdict','Artist','11111111-1111-4111-8111-111111111104',NULL,'Buy','Sunlit Coastal','High',NULL,'Open','2026-07-01','2026-12-31','Q3 review','Children on sunlit sand, 20x24 and up, remains the most liquid line on the book. Depth is real at the 4–8k hammer band.'),
 ('22222222-2222-4222-8222-222222222207','Verdict','Artist','11111111-1111-4111-8111-111111111101',NULL,'Watch','Marine','Medium',NULL,'Open','2026-05-01','2026-08-01','Q2 review','Estuary scenes still clear, but hammer dispersion is widening. Hold size until autumn evidence.'),
 ('22222222-2222-4222-8222-222222222208','Trigger','Artist','11111111-1111-4111-8111-111111111103',NULL,NULL,'Marine','Medium',NULL,'Open','2026-04-01','2026-11-01','Standing rule','Act when a signed beach-launch subject appears below 1.6k hammer with an intact original frame.'),
 ('22222222-2222-4222-8222-222222222209','Trigger','Artist','11111111-1111-4111-8111-111111111104',NULL,NULL,'Sunlit Coastal','High',NULL,'Open','2026-07-01',NULL,'Standing rule','Bid to 6.5k hammer where the canvas is unlined and the sky is untouched.'),
 ('22222222-2222-4222-8222-222222222210','Observation','Artist','11111111-1111-4111-8111-111111111106',NULL,NULL,'Continental Oil','Low',NULL,'Open','2026-02-01','2026-06-01','Regional sale notes','Provincial rooms are still mispricing small French harbour panels, but the shipping drag eats most of the edge.');

INSERT INTO public.note_tags (note_id, tag) VALUES
 ('22222222-2222-4222-8222-222222222201','liquidity'),
 ('22222222-2222-4222-8222-222222222201','pricing'),
 ('22222222-2222-4222-8222-222222222202','venue'),
 ('22222222-2222-4222-8222-222222222203','condition'),
 ('22222222-2222-4222-8222-222222222204','pricing'),
 ('22222222-2222-4222-8222-222222222205','subject'),
 ('22222222-2222-4222-8222-222222222206','liquidity'),
 ('22222222-2222-4222-8222-222222222207','pricing'),
 ('22222222-2222-4222-8222-222222222208','subject'),
 ('22222222-2222-4222-8222-222222222209','condition'),
 ('22222222-2222-4222-8222-222222222210','shipping');
-- 20260824073000_capture-comps-rollup-artist360-views.sql
--
-- Captures the mutualart_url feature end-to-end plus the two surface views,
-- so a `db reset` rebuilds them correctly. Ordered by dependency:
--   1. column + collision-guard constraint on artists (identity table)
--   2. re-home any data that the initial seed mistakenly wrote to
--      artist_desk_config
--   3. drop the misplaced column from artist_desk_config
--   4. recreate book_screen  (the view The Book reads)
--   5. recreate artist_360   (the view the Artist 360 page reads)
--
-- Idempotent: safe to re-run against a DB where these were already applied
-- by hand. mutualart_url lives on artists ONLY; the constraint enforces a
-- MutualArt artist-page URL (16-hex artist id), which structurally blocks
-- name-string / search URLs and the Ethel-Walker-style collision.
--
-- NB: if comps_rollup / artist_zone_fitness capture DDL already sits in this
-- file above this marker, leave it in place; this block is additive.

begin;

-- 1. Identity column + collision-guard constraint --------------------------

alter table artists
  add column if not exists mutualart_url text;

alter table artists
  drop constraint if exists mutualart_url_is_artist_id;
alter table artists
  add constraint mutualart_url_is_artist_id
  check (
    mutualart_url is null
    or mutualart_url ~* '^https://www\.mutualart\.com/Artist/[^/]+/[0-9A-F]{16}'
  );

-- 2. Re-home data from the initial mis-targeted seed -----------------------
--    Guarded so it no-ops cleanly once the config column is gone.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'artist_desk_config' and column_name = 'mutualart_url'
  ) then
    update artists a
    set mutualart_url = c.mutualart_url
    from artist_desk_config c
    where c.artist_id = a.artist_id
      and c.mutualart_url is not null
      and a.mutualart_url is null;
  end if;
end $$;

-- 3. Remove the misplaced column from the levers table ---------------------

alter table artist_desk_config
  drop constraint if exists mutualart_url_is_artist_id;
alter table artist_desk_config
  drop column if exists mutualart_url;

-- 4. book_screen : the roster surface The Book renders ---------------------

drop view if exists book_screen;

create view book_screen as
 SELECT a.artist_id,
    a.display_name,
    a.dates,
    a.play_type,
    a.tier,
    a.arr_status,
    a.palette_pref,
    a.paper_sleeve,
    a.mutualart_url,
    c.buy_edge_flag,
    c.median_realisation,
    c.buy_regional_realisation,
    c.matched_spread,
    c.spread_trusted,
    c.thin_exit_flag,
    c.data_confidence,
    c.sell_through_pct,
    c.median_uk_hammer_gbp,
    c.exit_vs_regional_spread,
    c.level_read,
    c.n_exit_strong,
    c.n_buy_regional,
    c.updated_at AS comps_updated_at,
    COALESCE(f.open_flags, 0::bigint)::integer AS open_flags,
    c.price_cagr_full,
    c.sell_through_trend,
    c.ceiling_breach,
    z.zone_fitness,
    z.zone_conf,
    z.st_premium_pp AS zone_sellthrough_premium_pp
   FROM artists a
     LEFT JOIN comps_rollup c ON c.artist_id = a.artist_id
     LEFT JOIN artist_zone_fitness z ON z.artist_id = a.artist_id
     LEFT JOIN ( SELECT notes.artist_id,
            count(*) AS open_flags
           FROM notes
          WHERE notes.note_type = 'Flag'::note_type_t
            AND notes.action_status = 'Open'::action_status_t
          GROUP BY notes.artist_id) f ON f.artist_id = a.artist_id
  WHERE a.tracked;

-- 5. artist_360 : the per-name surface the Artist 360 page renders ---------

drop view if exists artist_360;

create view artist_360 as
 SELECT a.artist_id,
    a.display_name,
    a.dates,
    a.tier,
    a.arr_status,
    a.play_type,
    a.palette_pref,
    a.mutualart_url,
    c.median_uk_hammer_gbp,
    c.sell_through_pct,
    c.n_uk_auto_oil,
    c.data_confidence,
    c.buy_regional_realisation,
    c.in_zone_realisation,
    c.median_realisation,
    c.n_exit_strong,
    c.n_buy_regional,
    c.thin_exit_flag,
    c.spread_trusted,
    c.matched_spread,
    c.matched_n,
    c.exit_vs_regional_spread,
    c.arb_edge_raw,
    c.buy_edge_flag,
    c.arb_read,
    COALESCE(f.open_flags, 0::bigint)::integer AS open_flags,
    c.level_read,
    c.price_cagr_full,
    c.sell_through_trend,
    c.ceiling_breach,
    z.zone_fitness,
    z.zone_conf
   FROM artists a
     LEFT JOIN comps_rollup c ON c.artist_id = a.artist_id
     LEFT JOIN artist_zone_fitness z ON z.artist_id = a.artist_id
     LEFT JOIN ( SELECT notes.artist_id,
            count(*) AS open_flags
           FROM notes
          WHERE notes.note_type = 'Flag'::note_type_t
            AND notes.action_status = 'Open'::action_status_t
          GROUP BY notes.artist_id) f ON f.artist_id = a.artist_id;

commit;

-- Post-apply sanity (run manually, not part of the migration):
--   notify pgrst, 'reload schema';
--   select count(*) filter (where mutualart_url is not null) as seeded from artists;   -- expect 32
--   select artist_id, mutualart_url from book_screen where artist_id in ('alfred-east','clarkson-stanfield');

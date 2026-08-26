-- 20260824073000_capture-comps-rollup-artist360-views.sql
-- (existing comps_rollup capture DDL stays as-is above this block)

-- 1. Column + collision-guard constraint on the correct (identity) table
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

-- 2. Re-home the data from where the seed mistakenly landed
update artists a
set mutualart_url = c.mutualart_url
from artist_desk_config c
where c.artist_id = a.artist_id
  and c.mutualart_url is not null;

-- 3. Remove the misplaced column + its constraint from the levers table
alter table artist_desk_config
  drop constraint if exists mutualart_url_is_artist_id;
alter table artist_desk_config
  drop column if exists mutualart_url;

-- 4. Recreate the surface view with the new field
create or replace view artist_360 as
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
          WHERE notes.note_type = 'Flag'::note_type_t AND notes.action_status = 'Open'::action_status_t
          GROUP BY notes.artist_id) f ON f.artist_id = a.artist_id;

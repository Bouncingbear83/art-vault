-- Artist register lanes. Lookup table rather than an enum so future lanes
-- are an INSERT, not DDL. See vault 2026-08-30-artist-onboarding-ladder-01.

create table public.register_defs (
  register_code text primary key,
  label         text not null,
  description   text not null,
  active        boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.register_defs enable row level security;

create policy register_defs_all on public.register_defs
  for all to authenticated using (true) with check (true);

insert into public.register_defs (register_code, label, description, sort_order) values
('sunlit_topographical', 'Sunlit topographical',
 'Place carries the picture: Venice, Nile/Egypt, harbour and marine, ruins, river/city, townscape. Level is set by subject, view and size.', 10),
('high_colour_figurative', 'High colour, figurative',
 'Colour, figure and pattern carry the picture: figure, garden, flower, market and crowd subjects. Level is set by handling and palette rather than by place.', 20);

alter table public.artists add column register text
  references public.register_defs(register_code);

update public.artists set register = 'sunlit_topographical' where register is null;

update public.artists set register = 'high_colour_figurative'
where artist_id in (
  'anna-airy','dorothea-sharp','elizabeth-forbes','emily-beatrice-bland',
  'ethel-walker','sophie-anderson','william-kay-blacklock','alexander-mann',
  'frank-brangwyn','henry-scott-tuke'
);

alter table public.artists alter column register set not null;

comment on column public.artists.register is
  'Screening and aggregation lane. Prevents pooling two registers in one median. Never an eligibility gate.';

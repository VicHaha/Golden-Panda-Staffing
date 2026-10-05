-- =========================================================
-- Golden Panda Retail Operation
-- Migration: user-editable stock locations
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- Until now stock was split across three fixed columns (Store Room, Home
-- Shelf, Standee — opening and closing versions) plus a separate running
-- Warehouse figure. This migration replaces that with a list the office
-- can edit (add / rename / remove):
--
--   stock_locations                     the list itself (seeded with the
--                                       four locations below)
--   sales_reports.location_qty          opening qty per location (jsonb)
--   sales_reports.closing_location_qty  closing qty per location (jsonb)
--
-- The jsonb objects are keyed by stock_locations.id, e.g.
--   { "<store room id>": 0, "<home shelf id>": 0, "<standee id>": 40, "<warehouse id>": 11 }
--
-- EXISTING DATA IS COPIED ACROSS, nothing is deleted. The old columns
-- (store_room_qty, home_shelf_qty, standee_qty, closing_*, warehouse_qty)
-- are left in place and untouched as a safety net; the apps just stop
-- reading them. Warehouse used to be a single running total, so its value
-- is copied into BOTH the opening and the closing map (it behaves like any
-- other location from now on: closing carries forward to the next day).
--
-- Safe to run more than once: the seed only runs on an empty table and the
-- copy only touches rows that haven't been copied yet.

create table if not exists stock_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table stock_locations enable row level security;

drop policy if exists "anyone can read stock locations" on stock_locations;
create policy "anyone can read stock locations" on stock_locations
  for select using (true);

drop policy if exists "signed-in users can add stock locations" on stock_locations;
create policy "signed-in users can add stock locations" on stock_locations
  for insert to authenticated with check (true);

drop policy if exists "signed-in users can edit stock locations" on stock_locations;
create policy "signed-in users can edit stock locations" on stock_locations
  for update to authenticated using (true) with check (true);

drop policy if exists "signed-in users can delete stock locations" on stock_locations;
create policy "signed-in users can delete stock locations" on stock_locations
  for delete to authenticated using (true);

-- Seed (only when the table is empty).
insert into stock_locations (name, sort_order)
select v.name, v.ord
from (values ('Store Room', 1), ('Home Shelf', 2), ('Standee', 3), ('Warehouse', 4)) as v(name, ord)
where not exists (select 1 from stock_locations);

alter table sales_reports add column if not exists location_qty jsonb not null default '{}'::jsonb;
alter table sales_reports add column if not exists closing_location_qty jsonb not null default '{}'::jsonb;

-- Copy the existing figures across.
do $$
declare
  sr uuid;
  hs uuid;
  st uuid;
  wh uuid;
begin
  select id into sr from stock_locations where name = 'Store Room' order by created_at limit 1;
  select id into hs from stock_locations where name = 'Home Shelf' order by created_at limit 1;
  select id into st from stock_locations where name = 'Standee'    order by created_at limit 1;
  select id into wh from stock_locations where name = 'Warehouse'  order by created_at limit 1;

  if sr is null or hs is null or st is null or wh is null then
    raise exception 'Could not find the seeded locations (Store Room / Home Shelf / Standee / Warehouse) in stock_locations. Restore those four names, run this again, then rename them in the app.';
  end if;

  update sales_reports
  set
    location_qty = jsonb_build_object(
      sr::text, coalesce(store_room_qty, 0),
      hs::text, coalesce(home_shelf_qty, 0),
      st::text, coalesce(standee_qty, 0),
      wh::text, coalesce(warehouse_qty, 0)
    ),
    closing_location_qty = jsonb_build_object(
      sr::text, coalesce(closing_store_room_qty, 0),
      hs::text, coalesce(closing_home_shelf_qty, 0),
      st::text, coalesce(closing_standee_qty, 0),
      wh::text, coalesce(warehouse_qty, 0)
    )
  where location_qty = '{}'::jsonb
    and closing_location_qty = '{}'::jsonb;
end $$;

-- Live sync: both apps refresh when someone edits the list.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stock_locations'
  ) then
    alter publication supabase_realtime add table stock_locations;
  end if;
end $$;

-- Quick sanity check (optional) — should return 0 once the copy has run:
--   select count(*) as not_copied from sales_reports where location_qty = '{}'::jsonb;

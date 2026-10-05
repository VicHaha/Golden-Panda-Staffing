-- =========================================================
-- Golden Panda Retail Operation
-- create_database_tables.sql
--
-- The WHOLE database structure in one file: tables, columns, indexes,
-- triggers, row level security and starter data. It replaces every old
-- schema / seed / rls / migration_* file.
--
-- • NEW project: run this file once and you're done.
-- • EXISTING project: run it too — it is safe. Every statement is
--   "create if not exists" / "add column if not exists", so it ONLY adds
--   what is missing. It never deletes a table, column or row, and never
--   rewrites your existing records.
--
-- After this, optionally run create_database_views.sql (reporting views).
--
-- Structure:
--
--   stores ──< jobs >── promoters      the Schedule = source of truth
--      │      (work_date, outlet, promoter, position, time, pay)
--      │
--      ├──< sales_reports              one row per OUTLET + DATE + SKU
--      │      location_qty / closing_location_qty = { stock_location_id: qty }
--      ├──< stock_locations            shared (store_id null) or per outlet
--      ├──< sales_log                  every +/- tap (feeds Undo)
--      ├──< shift_reports              engagement / conversion per shift
--      ├──< day_photos / day_feedback  photos and notes per working date
--      └──  memos, settings, users
-- =========================================================

-- ---------------------------------------------------------
-- Core: users, stores, promoters, jobs, settings
-- ---------------------------------------------------------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  role text not null check (role in ('admin','boss')),
  created_at timestamptz default now()
);

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  created_at timestamptz default now()
);

create table if not exists promoters (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  nickname text,
  ic_number text,
  age integer,
  phone text,
  address text,
  bank_name text,
  bank_account text,
  notes text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table promoters add column if not exists nickname text;

-- The Schedule. promoter_id is optional (a working date can exist before
-- anyone is assigned).
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid references promoters(id) on delete cascade,
  store_id uuid references stores(id) on delete restrict,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  pay numeric(10,2) default 0,
  commission numeric(10,2) default 0,
  remarks text,
  position text not null default 'Promoter',   -- Promoter / Assistant / Mascot
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table jobs add column if not exists position text not null default 'Promoter';

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  company_name text default 'Golden Panda',
  workspace_code text,
  created_at timestamptz default now()
);

create or replace function update_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_promoters_updated on promoters;
create trigger trg_promoters_updated before update on promoters
  for each row execute function update_timestamp();

drop trigger if exists trg_jobs_updated on jobs;
create trigger trg_jobs_updated before update on jobs
  for each row execute function update_timestamp();

-- ---------------------------------------------------------
-- Stock locations (editable; shared or per outlet)
-- ---------------------------------------------------------
create table if not exists stock_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  store_id uuid references stores(id) on delete cascade,  -- null = every outlet
  hidden_for uuid[] not null default '{}',                -- outlets a shared location is hidden for
  created_at timestamptz not null default now()
);
alter table stock_locations add column if not exists store_id uuid references stores(id) on delete cascade;
alter table stock_locations add column if not exists hidden_for uuid[] not null default '{}';

-- counts_in_total: does this location's stock count toward the opening/closing
-- totals? New column defaults to yes; the first time it is added, the shared
-- Warehouse location is switched off (Warehouse is shown but not totalled).
-- Changeable per location in the app (Stock Management > Locations).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'stock_locations' and column_name = 'counts_in_total'
  ) then
    alter table stock_locations add column counts_in_total boolean not null default true;
    update stock_locations set counts_in_total = false where lower(btrim(name)) = 'warehouse';
  end if;
end $$;

-- ---------------------------------------------------------
-- Sales & stock: one row per OUTLET + DATE + SKU
-- ---------------------------------------------------------
create table if not exists sales_reports (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  store_id uuid references stores(id) on delete set null,
  promoter_id uuid references promoters(id) on delete set null,
  product_name text not null,
  opening_qty numeric not null default 0,
  sales_qty numeric not null default 0,
  closing_qty numeric not null default 0,
  remarks text,
  photo_url text,
  is_free_item boolean not null default false,
  logged_by_admin_name text,
  location_qty jsonb not null default '{}'::jsonb,          -- opening per stock location
  closing_location_qty jsonb not null default '{}'::jsonb,  -- closing per stock location
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table sales_reports add column if not exists promoter_id uuid references promoters(id) on delete set null;
alter table sales_reports add column if not exists photo_url text;
alter table sales_reports add column if not exists is_free_item boolean not null default false;
alter table sales_reports add column if not exists logged_by_admin_name text;
alter table sales_reports add column if not exists location_qty jsonb not null default '{}'::jsonb;
alter table sales_reports add column if not exists closing_location_qty jsonb not null default '{}'::jsonb;

-- Legacy columns, kept ONLY so old records stay intact (the apps no longer
-- write them; their values live on in location_qty / closing_location_qty).
alter table sales_reports add column if not exists customer_feedback text;
alter table sales_reports add column if not exists store_room_qty numeric not null default 0;
alter table sales_reports add column if not exists home_shelf_qty numeric not null default 0;
alter table sales_reports add column if not exists standee_qty numeric not null default 0;
alter table sales_reports add column if not exists closing_store_room_qty numeric default 0;
alter table sales_reports add column if not exists closing_home_shelf_qty numeric default 0;
alter table sales_reports add column if not exists closing_standee_qty numeric default 0;
alter table sales_reports add column if not exists warehouse_qty numeric not null default 0;

-- History of every +/- tap in the Sales Section (admin_name holds the
-- promoter's display name for taps made in the promoter app).
create table if not exists sales_log (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  store_id uuid references stores(id) on delete set null,
  product_name text not null,
  delta integer not null,
  admin_name text,
  promoter_id uuid references promoters(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Engagement / conversion per promoter per shift (logged in the promoter app).
create table if not exists shift_reports (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  shift text not null check (shift in ('before_break', 'after_break')),
  store_id uuid references stores(id) on delete set null,
  promoter_id uuid references promoters(id) on delete set null,
  engaged integer not null default 0,
  successful_engagements integer not null default 0,
  purchases integer not null default 0,
  avg_engagement_time numeric,
  customer_feedback text,
  customer_age_range text check (customer_age_range in ('under_18', '18_25', '26_35', '36_50', '50_plus')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table shift_reports add column if not exists customer_age_range text
  check (customer_age_range in ('under_18', '18_25', '26_35', '36_50', '50_plus'));

-- Photos and notes per working date.
create table if not exists day_photos (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,                  -- several photos per date are allowed
  store_id uuid references stores(id) on delete set null,
  promoter_id uuid references promoters(id) on delete set null,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table day_photos drop constraint if exists day_photos_work_date_key;  -- old one-photo-per-date rule

create table if not exists day_feedback (
  id uuid primary key default gen_random_uuid(),
  work_date date not null unique,
  store_id uuid references stores(id) on delete set null,
  promoter_id uuid references promoters(id) on delete set null,
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Admin notes (Schedule > Memo).
create table if not exists memos (
  id uuid primary key default gen_random_uuid(),
  note_date date,
  text text not null,
  created_by text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------
create index if not exists idx_promoters_name              on promoters (full_name);
create index if not exists idx_jobs_date                   on jobs (work_date);
create index if not exists idx_jobs_promoter               on jobs (promoter_id);
create index if not exists idx_jobs_store                  on jobs (store_id);
create index if not exists jobs_date_store_idx             on jobs (work_date, store_id);
create index if not exists jobs_promoter_date_idx          on jobs (promoter_id, work_date);
create index if not exists sales_reports_work_date_idx     on sales_reports (work_date);
create index if not exists sales_reports_promoter_id_idx   on sales_reports (promoter_id);
create index if not exists sales_reports_store_date_idx    on sales_reports (store_id, work_date);
create index if not exists sales_reports_date_store_idx    on sales_reports (work_date, store_id);
create index if not exists sales_log_work_date_idx         on sales_log (work_date, created_at desc);
create index if not exists sales_log_store_date_idx        on sales_log (store_id, work_date);
create index if not exists shift_reports_work_date_idx     on shift_reports (work_date);
create index if not exists shift_reports_promoter_id_idx   on shift_reports (promoter_id);
create index if not exists day_photos_work_date_idx        on day_photos (work_date);
create index if not exists day_feedback_work_date_idx      on day_feedback (work_date);
create index if not exists stock_locations_store_idx       on stock_locations (store_id);
create index if not exists memos_created_at_idx            on memos (created_at desc);

-- ---------------------------------------------------------
-- Row level security
-- Core tables: signed-in users only (both apps require a login).
-- Reports, logs and photos: anyone can read, only signed-in users can write.
-- ---------------------------------------------------------
do $$
declare
  t text;
begin
  -- signed-in only
  foreach t in array array['users','promoters','stores','jobs','settings','memos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "anon full access" on %I', t);
    execute format('drop policy if exists "signed-in users only" on %I', t);
    execute format('create policy "signed-in users only" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', t);
  end loop;

  -- public read, signed-in write
  foreach t in array array['sales_reports','sales_log','shift_reports','day_photos','day_feedback','stock_locations'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "anon full access" on %I', t);
    execute format('drop policy if exists "anyone can read" on %I', t);
    execute format('drop policy if exists "signed-in users can write" on %I', t);
    execute format('create policy "anyone can read" on %I for select using (true)', t);
    execute format('create policy "signed-in users can write" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Older versions of these files created differently-named policies on the
-- same tables; remove those duplicates so only the two rules above apply.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('sales_reports','sales_log','shift_reports','day_photos','day_feedback','stock_locations')
      and policyname not in ('anyone can read', 'signed-in users can write')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------
-- Starter data (only fills what is empty)
-- ---------------------------------------------------------
insert into stores (name) values ('de Market'), ('Isetan'), ('W Mart')
on conflict (name) do nothing;

insert into settings (company_name, workspace_code)
select 'Golden Panda', 'DEFAULT'
where not exists (select 1 from settings);

insert into stock_locations (name, sort_order, counts_in_total)
select v.name, v.ord, (v.name <> 'Warehouse')
from (values ('Store Room', 1), ('Home Shelf', 2), ('Standee', 3), ('Warehouse', 4)) as v(name, ord)
where not exists (select 1 from stock_locations);

-- ---------------------------------------------------------
-- Copy legacy per-location columns into the flexible maps
-- (only rows that have not been copied yet; the old columns stay as they are)
-- ---------------------------------------------------------
do $$
declare
  sr uuid;
  hs uuid;
  st uuid;
  wh uuid;
begin
  select id into sr from stock_locations where name = 'Store Room' and store_id is null order by created_at limit 1;
  select id into hs from stock_locations where name = 'Home Shelf' and store_id is null order by created_at limit 1;
  select id into st from stock_locations where name = 'Standee'    and store_id is null order by created_at limit 1;
  select id into wh from stock_locations where name = 'Warehouse'  and store_id is null order by created_at limit 1;

  -- If someone already renamed the starter locations, skip the copy quietly;
  -- an existing project has been copied already by the earlier migration.
  if sr is not null and hs is not null and st is not null and wh is not null then
    update sales_reports
    set
      location_qty = jsonb_build_object(
        sr::text, coalesce(store_room_qty, 0), hs::text, coalesce(home_shelf_qty, 0),
        st::text, coalesce(standee_qty, 0),    wh::text, coalesce(warehouse_qty, 0)),
      closing_location_qty = jsonb_build_object(
        sr::text, coalesce(closing_store_room_qty, store_room_qty, 0),
        hs::text, coalesce(closing_home_shelf_qty, home_shelf_qty, 0),
        st::text, coalesce(closing_standee_qty, standee_qty, 0),
        wh::text, coalesce(warehouse_qty, 0))
    where location_qty = '{}'::jsonb and closing_location_qty = '{}'::jsonb;
  end if;
end $$;

-- ---------------------------------------------------------
-- Safety rules for FUTURE writes only (existing rows are not re-checked)
-- ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_reports_qty_not_negative') then
    alter table sales_reports
      add constraint sales_reports_qty_not_negative
      check (opening_qty >= 0 and sales_qty >= 0 and closing_qty >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_locations_name_not_blank') then
    alter table stock_locations
      add constraint stock_locations_name_not_blank
      check (btrim(name) <> '') not valid;
  end if;
end $$;

-- One row per outlet + date + SKU. Built only when no duplicates exist today
-- (nothing is deleted to make room for it). If you see the notice, review
-- v_check_duplicate_sales_rows (from create_database_views.sql), fix them in
-- the app, then run this file again.
do $$
begin
  if exists (
    select 1 from sales_reports
    group by work_date, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(product_name))
    having count(*) > 1
  ) then
    raise notice 'Duplicate outlet/date/SKU rows exist - review v_check_duplicate_sales_rows, fix them in the app, then run this file again to add the one-row-per-SKU rule.';
  else
    create unique index if not exists sales_reports_one_row_per_outlet_day_sku
      on sales_reports (work_date, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(product_name)));
  end if;
end $$;

-- ---------------------------------------------------------
-- Live sync: let both apps hear about changes instantly
-- ---------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['promoters','jobs','stores','sales_reports','sales_log','stock_locations','day_photos','day_feedback','shift_reports'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table %I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------
-- Documentation
-- ---------------------------------------------------------
comment on table jobs            is 'The Schedule. Single source of truth for who works at which outlet, when, in what role and for what pay. Stock and sales rows are created for outlets that have a job.';
comment on table sales_reports   is 'One row per OUTLET + working DATE + SKU: opening/sales/closing plus stock per location (location_qty / closing_location_qty, keyed by stock_locations.id). Legacy columns (store_room_qty, home_shelf_qty, standee_qty, closing_*_qty, warehouse_qty, customer_feedback) are kept for history and no longer written.';
comment on table stock_locations is 'Editable stock locations. store_id null = shared by every outlet; set = that outlet only. hidden_for = outlets a shared location is hidden for. active=false = removed (history keeps its numbers).';
comment on table sales_log       is 'Every +/- tap in the Sales Section (who, which SKU, which outlet, +1/-1). Used by Undo.';
comment on table memos           is 'Admin notes shown from the Schedule memo button.';

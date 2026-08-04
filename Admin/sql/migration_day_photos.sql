-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: overall "day photo" per working date
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- One overall photo per working date (e.g. the booth/table setup),
-- separate from the per-product stock rows in sales_reports. Only one
-- row per work_date — saving again replaces the same row (upsert).
--
-- Same storage approach as sales_reports.photo_url: only a Cloudinary
-- URL is stored here, not the image itself, so this doesn't touch
-- Supabase's 500MB storage limit.

create table if not exists day_photos (
  id uuid primary key default gen_random_uuid(),
  work_date date not null unique,
  store_id uuid references stores(id) on delete set null,
  promoter_id uuid references promoters(id) on delete set null,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists day_photos_work_date_idx on day_photos (work_date);

alter table day_photos enable row level security;

-- Same access pattern as sales_reports after migration_auth_lockdown.sql:
-- anyone can read, only a signed-in session can write.
drop policy if exists "anyone can read day photos" on day_photos;
create policy "anyone can read day photos" on day_photos
  for select using (true);

drop policy if exists "signed-in users can add day photos" on day_photos;
create policy "signed-in users can add day photos" on day_photos
  for insert to authenticated with check (true);

drop policy if exists "signed-in users can edit day photos" on day_photos;
create policy "signed-in users can edit day photos" on day_photos
  for update to authenticated using (true) with check (true);

drop policy if exists "signed-in users can delete day photos" on day_photos;
create policy "signed-in users can delete day photos" on day_photos
  for delete to authenticated using (true);

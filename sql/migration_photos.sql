-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: promoter photos
-- Run this once in Supabase SQL Editor.
-- =========================================================

-- 1. New column on promoters to store the public photo URL
alter table promoters add column if not exists photo_url text;

-- 2. Storage bucket to hold the actual image files
insert into storage.buckets (id, name, public)
values ('promoter-photos', 'promoter-photos', true)
on conflict (id) do nothing;

-- 3. Storage access policies.
-- Matching the same "open access via anon key" model the rest of this
-- app uses (see sql/rls.sql for the tradeoffs — same applies here).
drop policy if exists "anon read promoter photos" on storage.objects;
create policy "anon read promoter photos" on storage.objects
  for select to public
  using (bucket_id = 'promoter-photos');

drop policy if exists "anon upload promoter photos" on storage.objects;
create policy "anon upload promoter photos" on storage.objects
  for insert to public
  with check (bucket_id = 'promoter-photos');

drop policy if exists "anon update promoter photos" on storage.objects;
create policy "anon update promoter photos" on storage.objects
  for update to public
  using (bucket_id = 'promoter-photos');

drop policy if exists "anon delete promoter photos" on storage.objects;
create policy "anon delete promoter photos" on storage.objects
  for delete to public
  using (bucket_id = 'promoter-photos');

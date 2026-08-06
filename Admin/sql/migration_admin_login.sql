-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: real admin login (Supabase Auth) + attribution
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- What this does:
-- 1. Wires up the existing (until now unused) `users` table so the
--    office app can ask "who are you?" the first time each admin signs
--    in, and remember their typed name from then on.
-- 2. Adds `created_by` / `updated_by` text columns to promoters, jobs,
--    sales_reports, and day_photos so every record saved from the
--    office app is tagged with the name of the admin who entered it.
-- 3. Tightens promoters / stores / jobs / settings so only a signed-in
--    admin can add/edit/delete — reading stays open (the promoter app
--    still needs to read promoters/stores/jobs without its own login
--    to that data). sales_reports / day_photos already work this way
--    from migration_auth_lockdown.sql / migration_day_photos.sql.
--
-- IMPORTANT: after running this, the office app requires a real login
-- (email + password, same mechanism as the promoter app) — the old
-- "invisible office account" auto sign-in is removed from the code.
-- The first admin to log in on a fresh install just creates an
-- account (email + password) via "Create one" on the login screen,
-- same as promoters do.

-- ---------------- users table wiring ----------------

alter table users
  add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;

create unique index if not exists users_auth_user_id_key on users(auth_user_id);

alter table users enable row level security;

drop policy if exists "signed-in users can read the admin directory" on users;
create policy "signed-in users can read the admin directory" on users
  for select to authenticated using (true);

drop policy if exists "a signed-in admin can create their own row" on users;
create policy "a signed-in admin can create their own row" on users
  for insert to authenticated with check (auth_user_id = auth.uid());

drop policy if exists "a signed-in admin can update their own row" on users;
create policy "a signed-in admin can update their own row" on users
  for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- ---------------- attribution columns ----------------

alter table promoters     add column if not exists created_by text, add column if not exists updated_by text;
alter table jobs          add column if not exists created_by text, add column if not exists updated_by text;
alter table sales_reports add column if not exists created_by text, add column if not exists updated_by text;
alter table day_photos    add column if not exists created_by text, add column if not exists updated_by text;

-- ---------------- tighten writes to signed-in admins ----------------
-- Reads stay public (using (true)) so the promoter app keeps working
-- exactly as before; only insert/update/delete now require a session.

drop policy if exists "anon full access" on promoters;
create policy "anyone can read promoters" on promoters
  for select using (true);
create policy "signed-in admins can add promoters" on promoters
  for insert to authenticated with check (true);
create policy "signed-in admins can edit promoters" on promoters
  for update to authenticated using (true) with check (true);
create policy "signed-in admins can delete promoters" on promoters
  for delete to authenticated using (true);

drop policy if exists "anon full access" on stores;
create policy "anyone can read stores" on stores
  for select using (true);
create policy "signed-in admins can add stores" on stores
  for insert to authenticated with check (true);
create policy "signed-in admins can edit stores" on stores
  for update to authenticated using (true) with check (true);
create policy "signed-in admins can delete stores" on stores
  for delete to authenticated using (true);

drop policy if exists "anon full access" on jobs;
create policy "anyone can read jobs" on jobs
  for select using (true);
create policy "signed-in admins can add jobs" on jobs
  for insert to authenticated with check (true);
create policy "signed-in admins can edit jobs" on jobs
  for update to authenticated using (true) with check (true);
create policy "signed-in admins can delete jobs" on jobs
  for delete to authenticated using (true);

drop policy if exists "anon full access" on settings;
create policy "anyone can read settings" on settings
  for select using (true);
create policy "signed-in admins can add settings" on settings
  for insert to authenticated with check (true);
create policy "signed-in admins can edit settings" on settings
  for update to authenticated using (true) with check (true);
create policy "signed-in admins can delete settings" on settings
  for delete to authenticated using (true);

-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: require login for promoters/stores/jobs/settings too
-- Run this once in Supabase SQL Editor, AFTER office staff have real
-- accounts (see the office app's new login/create-account screen).
-- =========================================================
--
-- OPTIONAL — the office app works fine without this, since it now signs
-- everyone in for real before it renders anything. This migration is
-- the "UPGRADE PATH" described at the bottom of sql/rls.sql: it closes
-- the last hole, where promoters/stores/jobs/settings were still
-- readable and writable by anyone with the public anon key, logged in
-- or not. sales_reports was already locked down to signed-in users only
-- by migration_auth_lockdown.sql — this brings the other four tables
-- up to the same standard.
--
-- Do NOT run this before office staff can log in (see the office app's
-- README), or the app will stop being able to read/write anything.

drop policy if exists "anon full access" on promoters;
create policy "signed-in users only" on promoters
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "anon full access" on stores;
create policy "signed-in users only" on stores
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "anon full access" on jobs;
create policy "signed-in users only" on jobs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "anon full access" on settings;
create policy "signed-in users only" on settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

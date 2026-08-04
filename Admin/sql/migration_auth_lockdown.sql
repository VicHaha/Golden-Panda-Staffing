-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: require login to write sales & stock reports
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- This tightens sales_reports specifically (not promoters, jobs, or
-- stores — those stay as open as before). Reading reports still works
-- for anyone with the anon key, but adding/editing/deleting a report
-- now requires a signed-in Supabase Auth session.
--
-- IMPORTANT: after running this, the office app needs its own
-- (invisible, automatic) login to keep writing to sales_reports —
-- see the "office account" setup step in the README before deploying.

drop policy if exists "anon full access" on sales_reports;

create policy "anyone can read sales reports" on sales_reports
  for select using (true);

create policy "signed-in users can add sales reports" on sales_reports
  for insert to authenticated with check (true);

create policy "signed-in users can edit sales reports" on sales_reports
  for update to authenticated using (true) with check (true);

create policy "signed-in users can delete sales reports" on sales_reports
  for delete to authenticated using (true);

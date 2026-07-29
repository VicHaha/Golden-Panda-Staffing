-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: promoter shift reports
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- One row per promoter, per working date, per shift (before/after the
-- midday break). Feeds engagement & conversion analytics — how many
-- people were engaged, how many of those engagements were "successful"
-- (led somewhere), how many turned into a purchase, and how long an
-- average engagement took.
--
-- Same access pattern as sales_reports after migration_auth_lockdown.sql:
-- anyone can read, only a signed-in session can write. This app already
-- requires promoters to log in, so no separate lockdown migration is
-- needed here.

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
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shift_reports_work_date_idx on shift_reports (work_date);
create index if not exists shift_reports_promoter_id_idx on shift_reports (promoter_id);

alter table shift_reports enable row level security;

drop policy if exists "anyone can read shift reports" on shift_reports;
create policy "anyone can read shift reports" on shift_reports
  for select using (true);

drop policy if exists "signed-in users can add shift reports" on shift_reports;
create policy "signed-in users can add shift reports" on shift_reports
  for insert to authenticated with check (true);

drop policy if exists "signed-in users can edit shift reports" on shift_reports;
create policy "signed-in users can edit shift reports" on shift_reports
  for update to authenticated using (true) with check (true);

drop policy if exists "signed-in users can delete shift reports" on shift_reports;
create policy "signed-in users can delete shift reports" on shift_reports
  for delete to authenticated using (true);

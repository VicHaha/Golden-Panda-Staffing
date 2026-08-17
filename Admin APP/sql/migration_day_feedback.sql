-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: one general "feedback" field per working date
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- Replaces the per-product `customer_feedback` field added in
-- migration_sales_customer_feedback.sql (each product row could carry
-- its own feedback note) with a single feedback field for the whole
-- working date, shown at the bottom of that date's record on the
-- Sales page — same idea as day_photos (one overall thing per date,
-- not per product).
--
-- Only one row per work_date — saving again replaces the same row
-- (upsert on work_date).

create table if not exists day_feedback (
  id uuid primary key default gen_random_uuid(),
  work_date date not null unique,
  store_id uuid references stores(id) on delete set null,
  promoter_id uuid references promoters(id) on delete set null,
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists day_feedback_work_date_idx on day_feedback (work_date);

alter table day_feedback enable row level security;

-- Same access pattern as day_photos: anyone can read, only a signed-in
-- session can write.
drop policy if exists "anyone can read day feedback" on day_feedback;
create policy "anyone can read day feedback" on day_feedback
  for select using (true);

drop policy if exists "signed-in users can add day feedback" on day_feedback;
create policy "signed-in users can add day feedback" on day_feedback
  for insert to authenticated with check (true);

drop policy if exists "signed-in users can edit day feedback" on day_feedback;
create policy "signed-in users can edit day feedback" on day_feedback
  for update to authenticated using (true) with check (true);

drop policy if exists "signed-in users can delete day feedback" on day_feedback;
create policy "signed-in users can delete day feedback" on day_feedback
  for delete to authenticated using (true);

-- The old per-product customer_feedback column on sales_reports is
-- retired — the app no longer reads or writes it. Left in place (not
-- dropped) so any feedback already logged against past products isn't
-- destroyed; safe to drop later with:
--   alter table sales_reports drop column customer_feedback;

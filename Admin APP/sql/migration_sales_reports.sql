-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: sales & stock reports
-- Run this once in Supabase SQL Editor.
-- =========================================================

create table if not exists sales_reports (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  store_id uuid references stores(id) on delete set null,
  product_name text not null,
  opening_qty numeric not null default 0,
  sales_qty numeric not null default 0,
  closing_qty numeric not null default 0,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_reports_work_date_idx on sales_reports (work_date);

alter table sales_reports enable row level security;

drop policy if exists "anon full access" on sales_reports;
create policy "anon full access" on sales_reports
  for all using (true) with check (true);

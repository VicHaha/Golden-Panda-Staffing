-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: attribute sales reports to a promoter
-- Run this once in Supabase SQL Editor.
-- =========================================================

alter table sales_reports
  add column if not exists promoter_id uuid references promoters(id) on delete set null;

create index if not exists sales_reports_promoter_id_idx on sales_reports (promoter_id);

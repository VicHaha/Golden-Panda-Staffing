-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: shift report customer age range
-- Run this once in Supabase SQL Editor (same project as
-- migration_shift_reports.sql, which must already be applied).
-- =========================================================
--
-- Adds a predominant-customer-age-range field to each shift report
-- entry, so the office can see which age groups are engaging best
-- per shift block (Before Break / After Break) and per store. This
-- is a broad "who did I mostly deal with this block" read from the
-- promoter, not a per-customer log.

alter table shift_reports
  add column if not exists customer_age_range text
  check (customer_age_range in ('under_18', '18_25', '26_35', '36_50', '50_plus'));

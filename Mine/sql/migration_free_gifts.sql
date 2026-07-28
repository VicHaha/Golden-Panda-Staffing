-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: free gift tracking on sales_reports
-- Run this once in Supabase SQL Editor (safe to run again).
--
-- Adds a column to log how many free gifts were given away per
-- product per working date, separate from opening/sales/closing
-- stock counts. Powers the "Total free gifts given" figure on the
-- Analysis tab.
-- =========================================================

alter table sales_reports
  add column if not exists free_gift_qty numeric not null default 0;

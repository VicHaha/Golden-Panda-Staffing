-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: record which admin logged a stock entry
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- Admin app entries have no promoter_id (that column stays null for
-- them, same as before), so "Logged By" in the export/app just showed
-- a generic "Admin". This adds a column to capture the actual typed-in
-- admin name (see currentAdminName in js/app.js) at the time the row
-- was saved. Untouched by the Promoters app — always null there.

alter table sales_reports add column if not exists logged_by_admin_name text;

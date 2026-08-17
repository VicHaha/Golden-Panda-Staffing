-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: drop the "Notes" field from shift reports
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- The Notes (optional) field on the shift report form has been
-- removed from both apps (Promoter and Admin). This drops the
-- now-unused column from the table. Safe to run whether or not the
-- column still has data in it — it's simply discarded.
--
-- (migration_shift_reports.sql, which creates the table fresh, has
-- also been updated to no longer include this column, so a brand-new
-- database never gets it in the first place.)

alter table shift_reports drop column if exists notes;

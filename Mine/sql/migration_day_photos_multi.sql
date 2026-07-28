-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: allow unlimited day photos per working date
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- migration_day_photos.sql originally made work_date UNIQUE, so saving
-- a new day photo replaced whatever was already there for that date —
-- one photo per date, max. This drops that constraint: any number of
-- day photos can now be saved per working date. Existing rows are
-- untouched; going forward, each save inserts a new row instead of
-- overwriting the old one.

alter table day_photos drop constraint if exists day_photos_work_date_key;

-- The plain (non-unique) index on work_date from migration_day_photos.sql
-- still applies and still speeds up per-date lookups — nothing to change there.

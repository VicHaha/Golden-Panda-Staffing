-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: promoter nickname
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- Adds an optional nickname per promoter. When set, the nickname is
-- shown everywhere in both apps (roster, schedule, stock "logged by",
-- shift reports, analysis, etc) instead of the full legal name — except
-- in the Payout report/export, which always uses the full legal name
-- since that's tied to IC number and bank details for pay purposes.

alter table promoters add column if not exists nickname text;

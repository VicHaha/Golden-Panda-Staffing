-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: photo attachment for sales & stock reports
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- Stores only a URL (text), not the image itself — the actual photo
-- file is hosted on Cloudinary's free tier, not in Supabase, so this
-- does not count against Supabase's 500MB storage limit.

alter table sales_reports add column if not exists photo_url text;

-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: job position (Promoter / Assistant / Mascot)
-- Run this once in Supabase SQL Editor.
-- =========================================================

alter table jobs add column if not exists position text not null default 'Promoter';

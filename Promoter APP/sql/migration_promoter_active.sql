-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: normalize promoters.active
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- The `active` column has existed since your original schema but was
-- never actually used by the app until now. Existing rows likely have
-- it as NULL. This sets any NULL to true (visible/active) so hiding a
-- promoter is an explicit action, not an accident of old data, and
-- makes true the default for anything created from now on.

update promoters set active = true where active is null;
alter table promoters alter column active set default true;

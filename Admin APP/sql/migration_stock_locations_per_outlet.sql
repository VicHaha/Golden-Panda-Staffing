-- =========================================================
-- Golden Panda Retail Operation
-- Migration: stock locations per outlet
-- Run this once in Supabase SQL Editor, AFTER
-- migration_flexible_stock_locations.sql.
-- =========================================================
--
-- Lets each outlet have its own set of stock locations:
--
--   store_id    null  = the location applies to every outlet (all the
--                       locations that exist today stay like this)
--               set   = the location belongs to that one outlet only
--   hidden_for  outlets a shared (store_id null) location is hidden for
--
-- Existing data is untouched; every current location keeps applying to
-- every outlet until someone changes it in Stock Management > Locations.

alter table stock_locations add column if not exists store_id uuid references stores(id) on delete cascade;
alter table stock_locations add column if not exists hidden_for uuid[] not null default '{}';

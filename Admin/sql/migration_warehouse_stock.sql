-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: warehouse stock figure on sales_reports
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- A separate running "how much is in the warehouse" figure per product,
-- entered from the Admin app only — distinct from the existing
-- opening/sales/closing workflow numbers and from the Store Room / Home
-- Shelf / Standee breakdown (migration_stock_locations.sql). Unlike
-- those, it isn't reset or recalculated day to day: the app carries the
-- last entered value forward automatically onto each new working date's
-- row until someone edits it again. Defaults to 0 so existing rows and
-- the promoter app (which never sets this) are unaffected.

alter table sales_reports add column if not exists warehouse_qty numeric not null default 0;

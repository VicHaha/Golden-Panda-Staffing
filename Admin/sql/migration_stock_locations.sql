-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: stock-by-location breakdown on sales_reports
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- Three extra quantity fields, entered from the Admin app only, that
-- record how a product's current stock is split across locations —
-- separate from the existing opening/sales/closing workflow numbers.
-- All default to 0 so existing rows and the promoter app (which never
-- sets these) are unaffected.

alter table sales_reports add column if not exists store_room_qty numeric not null default 0;
alter table sales_reports add column if not exists home_shelf_qty numeric not null default 0;
alter table sales_reports add column if not exists standee_qty numeric not null default 0;

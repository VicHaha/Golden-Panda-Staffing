-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Migration: manually-editable "free item" flag on sales_reports
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- Previously, whether a product counted as a giveaway ("free item") was
-- decided purely by matching its name against a fixed list (Gift Set,
-- Flyer, Small Samples). This column makes it an explicit, editable
-- field per row instead, so any product can be marked as a free item
-- (or un-marked) from the Add/Edit stock report form.
--
-- Existing rows are backfilled using the same name-matching rule that
-- used to be the only source of truth, so nothing changes for data
-- already in the table. Going forward, new rows are seeded the same
-- way (see PRODUCT_SUGGESTIONS / GIVEAWAY_ITEMS in js/sales.js) but can
-- always be overridden by hand afterwards.

alter table sales_reports add column if not exists is_free_item boolean;

update sales_reports
set is_free_item = (lower(trim(product_name)) in ('gift set', 'flyer', 'small samples', 'coupons'))
where is_free_item is null;

alter table sales_reports alter column is_free_item set default false;
alter table sales_reports alter column is_free_item set not null;

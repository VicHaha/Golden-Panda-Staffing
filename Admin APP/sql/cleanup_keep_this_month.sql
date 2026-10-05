-- =========================================================
-- Golden Panda Retail Operation
-- cleanup_keep_this_month.sql  (one-off, run by hand)
--
-- Deletes EVERY record dated before the 1st of the current month and keeps
-- only this month's. "This month" and "today" use Malaysia time.
--
-- Cleared (rows dated before this month):
--   jobs            the Schedule
--   sales_reports   sales + stock rows
--   sales_log       the +/- tap history
--   shift_reports   engagement / conversion reports
--   day_photos      day photos
--   day_feedback    day notes
--
-- NOT touched: stores, promoters, stock_locations, settings, users, memos.
--
-- THIS CANNOT BE UNDONE. Export anything you still need first (the
-- Monthly Payout / Monthly Report files in the apps).
--
-- After it runs, an outlet whose last stock count was in an earlier month
-- and has no rows this month starts again from the default SKUs at zero.
--
-- HOW TO USE
--   1. Run STEP 1 on its own (select it, then Run): it only COUNTS.
--   2. If the numbers look right, run STEP 2.
-- =========================================================

-- ---------------------------------------------------------
-- STEP 1 — preview (changes nothing)
-- ---------------------------------------------------------
with bounds as (
  select date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur'))::date as month_start
)
select 'month kept starts on' as what, month_start::text as rows_affected from bounds
union all select 'jobs to delete',          count(*)::text from jobs,          bounds where work_date < month_start
union all select 'sales_reports to delete', count(*)::text from sales_reports, bounds where work_date < month_start
union all select 'sales_log to delete',     count(*)::text from sales_log,     bounds where work_date < month_start
union all select 'shift_reports to delete', count(*)::text from shift_reports, bounds where work_date < month_start
union all select 'day_photos to delete',    count(*)::text from day_photos,    bounds where work_date < month_start
union all select 'day_feedback to delete',  count(*)::text from day_feedback,  bounds where work_date < month_start
union all select 'jobs kept (this month on)',          count(*)::text from jobs,          bounds where work_date >= month_start
union all select 'sales_reports kept (this month on)', count(*)::text from sales_reports, bounds where work_date >= month_start;

-- ---------------------------------------------------------
-- STEP 2 — delete
-- ---------------------------------------------------------
begin;

delete from sales_log
where work_date < date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur'))::date;

delete from sales_reports
where work_date < date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur'))::date;

delete from shift_reports
where work_date < date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur'))::date;

delete from day_photos
where work_date < date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur'))::date;

delete from day_feedback
where work_date < date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur'))::date;

delete from jobs
where work_date < date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur'))::date;

commit;

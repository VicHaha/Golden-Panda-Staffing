-- =========================================================
-- Golden Panda Retail Operation
-- cleanup_stray_dates.sql  (one-off, run by hand)
--
-- Removes jobs that sit on a date which is NOT in your original records,
-- so those days stop showing up as working dates.
--
-- "Original records" = the Monthly Payout / Monthly Report / Daily Report
-- files. Their working dates are exactly:
--   Jul: 11 12 18 19 25 26
--   Aug: 1 2 8 9 15 16 29 30
--   Sep: 16 19 26
--   Oct: 3 4
--
-- Only dates from 2026-07-01 up to today are checked. FUTURE jobs (your
-- upcoming schedule) are never touched, and no original working date is
-- touched.
--
-- HOW TO USE
--   1. Run STEP 1 on its own (select it, then Run) and look at the rows.
--      They are what STEP 2 would delete.
--   2. If the list is right, run STEP 2.
-- =========================================================

-- ---------------------------------------------------------
-- STEP 1 — preview (changes nothing)
-- ---------------------------------------------------------
select j.id, j.work_date, j.start_time, j.end_time, j.position,
       p.full_name as promoter, s.name as outlet
from jobs j
left join promoters p on p.id = j.promoter_id
left join stores s    on s.id = j.store_id
where j.work_date between '2026-07-01' and current_date
  and j.work_date <> all (array[
    '2026-07-11','2026-07-12','2026-07-18','2026-07-19','2026-07-25','2026-07-26',
    '2026-08-01','2026-08-02','2026-08-08','2026-08-09','2026-08-15','2026-08-16','2026-08-29','2026-08-30',
    '2026-09-16','2026-09-19','2026-09-26',
    '2026-10-03','2026-10-04'
  ]::date[])
order by j.work_date, s.name;

-- Stock/sales rows on those same dates that nobody has touched (auto-created,
-- no sales, no remarks, no photo). STEP 2 removes only these; any row with
-- sales, a remark or a photo is kept.
select sr.id, sr.work_date, s.name as outlet, sr.product_name, sr.sales_qty
from sales_reports sr
left join stores s on s.id = sr.store_id
where sr.work_date between '2026-07-01' and current_date
  and sr.work_date <> all (array[
    '2026-07-11','2026-07-12','2026-07-18','2026-07-19','2026-07-25','2026-07-26',
    '2026-08-01','2026-08-02','2026-08-08','2026-08-09','2026-08-15','2026-08-16','2026-08-29','2026-08-30',
    '2026-09-16','2026-09-19','2026-09-26',
    '2026-10-03','2026-10-04'
  ]::date[])
  and sr.sales_qty = 0
  and coalesce(btrim(sr.remarks), '') = ''
  and sr.photo_url is null
order by sr.work_date, s.name, sr.product_name;

-- ---------------------------------------------------------
-- STEP 2 — delete (uncomment, then run)
-- ---------------------------------------------------------
-- begin;
--
-- delete from sales_reports sr
-- where sr.work_date between '2026-07-01' and current_date
--   and sr.work_date <> all (array[
--     '2026-07-11','2026-07-12','2026-07-18','2026-07-19','2026-07-25','2026-07-26',
--     '2026-08-01','2026-08-02','2026-08-08','2026-08-09','2026-08-15','2026-08-16','2026-08-29','2026-08-30',
--     '2026-09-16','2026-09-19','2026-09-26',
--     '2026-10-03','2026-10-04'
--   ]::date[])
--   and sr.sales_qty = 0
--   and coalesce(btrim(sr.remarks), '') = ''
--   and sr.photo_url is null;
--
-- delete from jobs j
-- where j.work_date between '2026-07-01' and current_date
--   and j.work_date <> all (array[
--     '2026-07-11','2026-07-12','2026-07-18','2026-07-19','2026-07-25','2026-07-26',
--     '2026-08-01','2026-08-02','2026-08-08','2026-08-09','2026-08-15','2026-08-16','2026-08-29','2026-08-30',
--     '2026-09-16','2026-09-19','2026-09-26',
--     '2026-10-03','2026-10-04'
--   ]::date[]);
--
-- commit;

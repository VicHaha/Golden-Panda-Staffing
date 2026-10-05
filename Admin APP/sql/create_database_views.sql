-- =========================================================
-- Golden Panda Retail Operation
-- create_database_views.sql
--
-- Optional reporting layer. Run AFTER create_database_tables.sql.
-- Only creates / replaces VIEWS: it reads your tables and never changes,
-- adds or deletes any record. Safe to run again at any time.
--
-- All views use security_invoker, so row level security of the underlying
-- tables still applies (nobody sees pay or stock they couldn't see before).
--
--   v_roster                       the Schedule flattened (who / where / when / pay)
--   v_stock_counts                 stock per outlet / date / SKU / location
--   v_sku_day_stock                per outlet / date / SKU: opening, sales, closing, variance, low flag
--   v_outlet_day_stock             per outlet / date totals (the Stock Management cards)
--   v_check_duplicate_sales_rows   diagnostic: same outlet + date + SKU recorded twice
--   v_check_rows_without_outlet    diagnostic: sales/stock rows with no outlet
--   v_check_rows_without_job       diagnostic: rows for an outlet on a day with no job
-- =========================================================

-- ---------------------------------------------------------
-- 2. Read layer (views)
-- ---------------------------------------------------------

-- The Schedule, flattened: who works where, when, in what role, for what pay.
create or replace view v_roster with (security_invoker = true) as
select
  j.id                                             as job_id,
  j.work_date,
  s.id                                             as store_id,
  s.name                                           as store_name,
  p.id                                             as promoter_id,
  coalesce(nullif(btrim(p.nickname), ''), p.full_name) as promoter_name,
  p.full_name                                      as promoter_full_name,
  coalesce(j.position, 'Promoter')                 as position,
  j.start_time,
  j.end_time,
  round(extract(epoch from (
    case when j.end_time >= j.start_time
         then j.end_time - j.start_time
         else j.end_time - j.start_time + interval '24 hours' end
  )) / 3600.0, 2)                                  as hours,
  j.pay,
  j.commission,
  coalesce(j.pay, 0) + coalesce(j.commission, 0)   as total_pay,
  j.remarks
from jobs j
left join stores s    on s.id = j.store_id
left join promoters p on p.id = j.promoter_id;

-- Stock per outlet / date / SKU / location (the jsonb maps unpacked).
create or replace view v_stock_counts with (security_invoker = true) as
select
  sr.id          as sales_report_id,
  sr.work_date,
  sr.store_id,
  st.name        as store_name,
  sr.product_name,
  l.id           as location_id,
  l.name         as location_name,
  l.active       as location_active,
  coalesce((sr.location_qty         ->> l.id::text)::numeric, 0) as opening_qty,
  coalesce((sr.closing_location_qty ->> l.id::text)::numeric, 0) as closing_qty
from sales_reports sr
left join stores st on st.id = sr.store_id
join stock_locations l
  on (l.store_id is null or l.store_id = sr.store_id)
where not coalesce(sr.is_free_item, false)
  and (sr.location_qty ? l.id::text or sr.closing_location_qty ? l.id::text);

-- One row per outlet / date / SKU with opening, sales, closing and variance.
-- variance = closing counted - (opening - sales); 0 means it tallies.
-- Totals use the locations that are currently active.
create or replace view v_sku_day_stock with (security_invoker = true) as
select
  sr.id                                   as sales_report_id,
  sr.work_date,
  sr.store_id,
  st.name                                 as store_name,
  sr.product_name,
  coalesce(sr.is_free_item, false)        as is_free_item,
  sr.sales_qty,
  coalesce(sum(c.opening_qty) filter (where c.location_active), 0) as opening_total,
  coalesce(sum(c.closing_qty) filter (where c.location_active), 0) as closing_total,
  coalesce(sum(c.closing_qty) filter (where c.location_active), 0)
    - (coalesce(sum(c.opening_qty) filter (where c.location_active), 0) - sr.sales_qty) as variance,
  (not coalesce(sr.is_free_item, false)
    and coalesce(sum(c.closing_qty) filter (where c.location_active), 0) < 10)          as is_low
from sales_reports sr
left join stores st on st.id = sr.store_id
left join v_stock_counts c on c.sales_report_id = sr.id
group by sr.id, sr.work_date, sr.store_id, st.name, sr.product_name, sr.is_free_item, sr.sales_qty;

-- One row per outlet / date: the numbers behind the Stock Management cards.
create or replace view v_outlet_day_stock with (security_invoker = true) as
select
  work_date,
  store_id,
  store_name,
  count(*) filter (where not is_free_item)                     as sku_count,
  sum(opening_total) filter (where not is_free_item)           as opening_total,
  sum(sales_qty)     filter (where not is_free_item)           as sales_total,
  sum(sales_qty)     filter (where is_free_item)               as given_out_total,
  sum(closing_total) filter (where not is_free_item)           as closing_total,
  sum(variance)      filter (where not is_free_item)           as variance_total,
  count(*) filter (where is_low)                               as low_sku_count
from v_sku_day_stock
group by work_date, store_id, store_name;

-- ---------------------------------------------------------
-- 3. Diagnostics: rows worth reviewing (read-only, nothing is changed)
-- ---------------------------------------------------------

-- The same outlet + date + SKU recorded more than once.
create or replace view v_check_duplicate_sales_rows with (security_invoker = true) as
select
  work_date,
  store_id,
  lower(btrim(product_name))     as sku,
  count(*)                       as copies,
  array_agg(id order by created_at) as row_ids
from sales_reports
group by work_date, store_id, lower(btrim(product_name))
having count(*) > 1;

-- Stock / sales rows that belong to no outlet.
create or replace view v_check_rows_without_outlet with (security_invoker = true) as
select id, work_date, product_name, opening_qty, sales_qty, closing_qty
from sales_reports
where store_id is null;

-- Stock / sales rows for an outlet on a day when that outlet has NO job in
-- the Schedule (e.g. recorded on the wrong date or the wrong outlet).
create or replace view v_check_rows_without_job with (security_invoker = true) as
select sr.id, sr.work_date, sr.store_id, st.name as store_name, sr.product_name,
       sr.opening_qty, sr.sales_qty, sr.closing_qty
from sales_reports sr
left join stores st on st.id = sr.store_id
where sr.store_id is not null
  and not exists (
    select 1 from jobs j where j.store_id = sr.store_id and j.work_date = sr.work_date
  );

comment on view v_roster         is 'Schedule flattened: date, outlet, person, position, shift time, hours, pay.';
comment on view v_stock_counts   is 'Stock per outlet/date/SKU/location (one row each), unpacked from the jsonb maps.';
comment on view v_sku_day_stock  is 'Per outlet/date/SKU: opening, sales, closing, variance (closing - (opening - sales)) and low flag (closing < 10).';
comment on view v_outlet_day_stock is 'Per outlet/date totals behind the Stock Management cards.';
comment on view v_check_duplicate_sales_rows is 'Diagnostic: same outlet+date+SKU recorded more than once.';
comment on view v_check_rows_without_outlet  is 'Diagnostic: sales/stock rows with no outlet.';
comment on view v_check_rows_without_job     is 'Diagnostic: sales/stock rows for an outlet on a day it has no job.';

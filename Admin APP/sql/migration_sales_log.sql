-- =========================================================
-- Golden Panda Retail Operation
-- Migration: sales history log (the "who tapped +/-" feed)
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- One row per tap of the +/- stepper in the Sales Section, in BOTH the
-- admin and promoter apps. Powers the per-day history under the sales
-- tables, e.g. "Victoria added 1 sales to 1L Bio Dishwash (Bidara) at
-- W Mart".
--
--   delta       +1 / -1 (the change that was actually applied)
--   admin_name  the name of whoever tapped — the admin's saved name, or the
--               promoter's display name when the tap came from the promoter
--               app (promoter_id is also set in that case)
--
-- Same access pattern as sales_reports: anyone can read, only a signed-in
-- session can write. Rows older than 3 months are purged by the office app
-- (same cutoff as sales_reports).

create table if not exists sales_log (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  store_id uuid references stores(id) on delete set null,
  product_name text not null,
  delta integer not null,
  admin_name text,
  promoter_id uuid references promoters(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sales_log_work_date_idx on sales_log (work_date, created_at desc);

alter table sales_log enable row level security;

drop policy if exists "anyone can read sales log" on sales_log;
create policy "anyone can read sales log" on sales_log
  for select using (true);

drop policy if exists "signed-in users can add sales log" on sales_log;
create policy "signed-in users can add sales log" on sales_log
  for insert to authenticated with check (true);

drop policy if exists "signed-in users can edit sales log" on sales_log;
create policy "signed-in users can edit sales log" on sales_log
  for update to authenticated using (true) with check (true);

drop policy if exists "signed-in users can delete sales log" on sales_log;
create policy "signed-in users can delete sales log" on sales_log
  for delete to authenticated using (true);

-- Live sync: let both apps hear about new log rows instantly.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sales_log'
  ) then
    alter publication supabase_realtime add table sales_log;
  end if;
end $$;

-- Separate per-location opening and closing stock counts.
-- Existing location counts are retained as opening counts and copied to
-- closing counts so applying this migration does not erase current stock.

alter table sales_reports add column if not exists closing_store_room_qty numeric;
alter table sales_reports add column if not exists closing_home_shelf_qty numeric;
alter table sales_reports add column if not exists closing_standee_qty numeric;

update sales_reports
set closing_store_room_qty = coalesce(closing_store_room_qty, store_room_qty, 0),
    closing_home_shelf_qty = coalesce(closing_home_shelf_qty, home_shelf_qty, 0),
    closing_standee_qty = coalesce(closing_standee_qty, standee_qty, 0);

alter table sales_reports alter column closing_store_room_qty set default 0;
alter table sales_reports alter column closing_home_shelf_qty set default 0;
alter table sales_reports alter column closing_standee_qty set default 0;


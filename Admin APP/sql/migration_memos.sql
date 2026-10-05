-- =========================================================
-- Golden Panda Retail Operation
-- Migration: memo notes (Schedule > Memo button, admin app)
-- Run this once in Supabase SQL Editor.
-- =========================================================
--
-- One general list of notes, newest first, with an optional date.
-- Only the admin app reads or writes this table. (Promoters share the
-- same Supabase login system, so this is "admin-only" by what the apps
-- show, not by a database-level role — same as the rest of the project.)

create table if not exists memos (
  id uuid primary key default gen_random_uuid(),
  note_date date,
  text text not null,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists memos_created_at_idx on memos (created_at desc);

alter table memos enable row level security;

drop policy if exists "signed-in users can read memos" on memos;
create policy "signed-in users can read memos" on memos
  for select to authenticated using (true);

drop policy if exists "signed-in users can add memos" on memos;
create policy "signed-in users can add memos" on memos
  for insert to authenticated with check (true);

drop policy if exists "signed-in users can edit memos" on memos;
create policy "signed-in users can edit memos" on memos
  for update to authenticated using (true) with check (true);

drop policy if exists "signed-in users can delete memos" on memos;
create policy "signed-in users can delete memos" on memos
  for delete to authenticated using (true);

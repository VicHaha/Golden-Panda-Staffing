-- =========================================================
-- Golden Panda Roadshow Staffing System
-- Row Level Security (RLS)
-- =========================================================
--
-- This app currently has no login screen — every phone connects using
-- the same public "anon" key. That means these policies are the ONLY
-- thing standing between your data and anyone who has your Supabase URL
-- and anon key. Since both are visible in your app's front-end code,
-- treat this as "not password-protected" rather than "secure."
--
-- For a small internal tool where the URL isn't published anywhere
-- public, this is a reasonable starting point. See the README for how
-- to add real login (Supabase Auth) and tighten these policies later.

alter table promoters enable row level security;
alter table stores    enable row level security;
alter table jobs      enable row level security;
alter table settings  enable row level security;

-- Open read/write for the anon key on every table used by the app.
drop policy if exists "anon full access" on promoters;
create policy "anon full access" on promoters
  for all using (true) with check (true);

drop policy if exists "anon full access" on stores;
create policy "anon full access" on stores
  for all using (true) with check (true);

drop policy if exists "anon full access" on jobs;
create policy "anon full access" on jobs
  for all using (true) with check (true);

drop policy if exists "anon full access" on settings;
create policy "anon full access" on settings
  for all using (true) with check (true);

-- =========================================================
-- UPGRADE PATH (do this once you add Supabase Auth / login):
--
-- 1. Replace the four policies above with something like:
--
--    create policy "signed-in users only" on promoters
--      for all using (auth.role() = 'authenticated')
--      with check (auth.role() = 'authenticated');
--
--    (repeat for stores, jobs, settings)
--
-- 2. Add a login screen using supabase.auth.signInWithPassword(...)
--    or a magic link, and create accounts for you + your boss in
--    Supabase Dashboard -> Authentication -> Users.
-- =========================================================

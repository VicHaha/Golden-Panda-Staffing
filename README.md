# Golden Panda — Roadshow Staffing App (Supabase edition)

Rebuilt to run on your Supabase project. Your `SUPABASE_URL` and anon key
from the zip you uploaded are already wired into `js/supabase.js` — you
should not need to touch that file.

## What to do next, in order

### 1. Run the SQL in Supabase (if you haven't already)

Go to your Supabase project → **SQL Editor** → New query, and run these
three files **in this order**:

1. `sql/schema.sql` — creates the tables (promoters, stores, jobs, settings)
2. `sql/seed.sql` — adds your starting stores (de Market, Isetan, W Mart)
3. `sql/rls.sql` — turns on Row Level Security with open access for now
   (your previous zip had this file empty — without it, your data has no
   protection at all, so don't skip this one)

If you already ran `schema.sql` and `seed.sql` before, running them again
is safe (they use `if not exists` / `on conflict do nothing`). Just make
sure `rls.sql` gets run.

### 2. Enable Realtime (optional, for live multi-phone sync)

In Supabase → **Database → Replication**, turn on replication for the
`promoters`, `jobs`, and `stores` tables. This makes changes made on one
phone appear on another within a second or two, without needing to
refresh. If you skip this step, the app still works fine — you'd just
need to switch tabs or reopen the app to see another phone's changes.

### 3. Deploy the app to a real URL

Same as before — two easy free options:

**Netlify Drop** (fastest, no account needed):
1. Go to https://app.netlify.com/drop
2. Drag this whole folder onto the page.
3. You get a live `https://` URL immediately.

**Firebase Hosting / Vercel / GitHub Pages** also all work fine for a
static site like this — use whichever you're already comfortable with.

### 4. Install it on your phone

1. Open the deployed URL in Chrome (Android) or Safari (iPhone).
2. Android: **⋮ menu → Install app**. iPhone: **Share → Add to Home Screen**.
3. It opens full-screen from your home screen like a native app.

### 5. Test it

Add a promoter, assign them to a job, check the Reports tab for the
month you picked. Everyone who opens the same deployed URL sees the
same data — there's no separate "workspace code" this time, since one
Supabase project already represents one company's data.

## What was fixed from your uploaded zip

- `js/app.js` had leftover Firebase code and literal `<script>` tags
  pasted inside a `.js` file, which broke the whole app on load.
- `js/promoter.js` / old `js/schedule.js` still used old Firebase field
  names (`name`, `icNum`, `promoterId`) instead of your real columns
  (`full_name`, `ic_number`, `promoter_id`) — nothing was actually
  wired to Supabase yet.
- `index.html` referenced `js/job.js`, a file that didn't exist in the zip.
- `js/utils.js` and `js/auth.js` were empty but other files depended on them.
- `sql/rls.sql` was empty — your tables had no access policy at all.

Everything above is fixed in this version, and it now uses your real
`stores`, `promoters`, and `jobs` tables with proper relations (a job
links to a promoter and a store by ID, not just by name).

## Security note

There's still no login screen — anyone with your deployed URL can use
the app, and the RLS policies are currently wide open (see the comment
block at the bottom of `sql/rls.sql`). That's an acceptable tradeoff for
a small internal tool with an unpublished URL, but if you want real
access control (e.g., only you and your boss can open it), the next step
is adding Supabase Auth — happy to build that next if you'd like it.

## Updating the app later

Edit the relevant file in `js/` or `css/`, then re-deploy the folder
(drag to Netlify again, etc.). Your data stays untouched in Supabase —
only the app code changes.

# Golden Panda — Roadshow Staffing App (Supabase edition)

Rebuilt to run on your Supabase project. Your `SUPABASE_URL` and anon key
from the zip you uploaded are already wired into `js/supabase.js` — you
should not need to touch that file.

## What to do next, in order

### 1. Run the SQL in Supabase (if you haven't already)

Go to your Supabase project → **SQL Editor** → New query, and run these
files **in this order**:

1. `sql/schema.sql` — creates the tables (promoters, stores, jobs, settings)
2. `sql/seed.sql` — adds your starting stores (de Market, Isetan, W Mart)
3. `sql/rls.sql` — turns on Row Level Security with open access for now
4. `sql/migration_position.sql` — adds the promoter role field (Promoter /
   Assistant / Mascot) to each job
5. `sql/migration_sales_reports.sql` — creates the new `sales_reports`
   table used by the Stock tab
6. `sql/migration_sales_promoter.sql` — attributes each stock report to
   the promoter who logged it
7. `sql/migration_auth_lockdown.sql` — requires a signed-in session to
   write sales reports (this is what powers password login in the
   separate promoter-facing stock report app)
8. `sql/migration_sales_photo.sql` — adds a `photo_url` column so stock
   reports can carry an attached photo (hosted on Cloudinary, not
   Supabase — see step 3 below)

All are safe to run again if you're not sure which you've already run.

### One-time cleanup: remove "PG Mall" from the store list

Run this once — it's a data fix, not a schema change, so it's not a
numbered migration file:

```sql
delete from stores where name ilike 'PG Mall';
```

Any past jobs/reports that referenced it will just show as
"(store removed)" instead of breaking.

### 2. Set up the office account (required after step 1.7 above)

Once `migration_auth_lockdown.sql` is run, saving a stock report needs
an authenticated session — including from this office app. This app has
no visible login screen; instead it signs in automatically in the
background using one shared account, so nothing changes for you day to
day. You just need to create that account once:

1. In Supabase → **Authentication → Users → Add user**. Email:
   `office@goldenpanda.internal` (or anything you like). Set a password.
2. Open `js/supabase.js` in this app, find `OFFICE_AUTH_EMAIL` and
   `OFFICE_AUTH_PASSWORD` near the top, and put in the same email and
   password. Redeploy.

If you skip this, everything else in the app keeps working — only
saving/editing/deleting Stock tab entries will fail until it's set up.

### 3. Set up Cloudinary for stock photos (required for the photo feature)

Stock report photos are hosted on **Cloudinary**, not Supabase — its
free tier gives ~25GB versus Supabase Storage's 500MB, and this keeps
photos completely separate from your database quota.

1. Create a free account at https://cloudinary.com
2. Your Dashboard shows a **"Cloud name"** near the top — copy it.
3. Go to **Settings → Upload → Upload presets → Add upload preset**.
   Set **Signing Mode** to **Unsigned**. Save, and copy the preset name.
4. Open `js/cloudinary.js` in both this app and the promoter app, and
   replace `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_UPLOAD_PRESET` with
   the values from steps 2–3. Redeploy both apps.

Until this is set up, everything else works fine — only the photo
upload button will show an error if tapped.

### What's new in this version

- **Self-hosted fonts** — headers no longer flash between a fallback
  font and the real one on load, since the font files now ship with the
  app instead of loading from Google Fonts.
- **Stock photos** — attach a photo to any stock report (see Cloudinary
  setup above). Stored outside Supabase entirely.
- **Auto-seeded daily stock rows** — every known product gets a row for
  today automatically, with opening stock carried over from yesterday's
  closing count, so promoters just fill in numbers instead of creating
  each product from scratch daily.
- **Promoters can now edit any stock entry for today** (not just their
  own), including ones you added from this app — but once a date isn't
  "today" anymore, only this office app can still edit it.

- **Default pay per position** — in the job form, picking a Position now
  shows a "Shift" dropdown with the standard pay presets (e.g. Promoter
  10:00–18:00 = RM140, or 10:30–13:30 = RM60; Mascot = RM100; Assistant =
  RM80). Picking one auto-fills start time, end time, and pay — all still
  editable afterward if a job needs a one-off rate. Choose "Custom" to
  skip the presets entirely.
- **Roadshow days now counts distinct dates** — if 4 promoters work the
  same Saturday, that's 1 roadshow day, not 4, both in the summary stat
  and in each promoter's day count.
- **New "Stock" tab** between Schedule and Reports — log opening stock,
  units sold, and closing stock per product for any working date. Entries
  are grouped by date and collapse/expand by tapping the date header. If
  the closing count doesn't match opening minus sold, it's flagged with a
  variance badge (useful for spotting shrinkage or miscounts).

### Heads up: jobs older than 3 months are now deleted automatically

Every time the app loads, it silently deletes any job whose date is more
than 3 months in the past. This keeps the Schedule tab tidy, but it also
means the **Reports tab can no longer show pay for a month once it ages
past 3 months old** — the underlying job records are gone.

**Export (Reports → Export .xlsx) any month you want to keep a record of
before it turns 3 months old.** If you'd rather keep full history forever
and only hide old jobs from view instead of deleting them, let me know —
that's a straightforward change.

If you already ran `schema.sql` and `seed.sql` before, running them again
is safe (they use `if not exists` / `on conflict do nothing`).

### 4. Enable Realtime (optional, for live multi-phone sync)

In Supabase → **Database → Replication**, turn on replication for the
`promoters`, `jobs`, and `stores` tables. This makes changes made on one
phone appear on another within a second or two, without needing to
refresh. If you skip this step, the app still works fine — you'd just
need to switch tabs or reopen the app to see another phone's changes.

### 5. Deploy the app to a real URL

Same as before — two easy free options:

**Netlify Drop** (fastest, no account needed):
1. Go to https://app.netlify.com/drop
2. Drag this whole folder onto the page.
3. You get a live `https://` URL immediately.

**Firebase Hosting / Vercel / GitHub Pages** also all work fine for a
static site like this — use whichever you're already comfortable with.

### 6. Install it on your phone

1. Open the deployed URL in Chrome (Android) or Safari (iPhone).
2. Android: **⋮ menu → Install app**. iPhone: **Share → Add to Home Screen**.
3. It opens full-screen from your home screen like a native app.

### 7. Test it

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

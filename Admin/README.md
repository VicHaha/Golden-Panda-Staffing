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
9. `sql/migration_day_photos.sql` — creates a `day_photos` table for one
   overall photo per working date (separate from each product's own
   stock row — see "Day photo row" below)
10. `sql/migration_day_photos_multi.sql` — allows unlimited day photos
    per date instead of just one
11. `sql/migration_promoter_active.sql` — normalizes the `active` column
    used by the new promoter hide/show feature
12. `sql/migration_admin_auth_rls.sql` — **optional**, run only after
    step 2 below (real login) is set up. Locks down promoters/stores/
    jobs/settings to signed-in users only, same as sales_reports
    already is.
13. `sql/migration_sales_customer_feedback.sql` — adds the
    `customer_feedback` column used by the Sales tab's new "Customer
    feedback" field (see "What's new in this version" below).

All are safe to run again if you're not sure which you've already run.

### One-time cleanup: remove "PG Mall" from the store list

Run this once — it's a data fix, not a schema change, so it's not a
numbered migration file:

```sql
delete from stores where name ilike 'PG Mall';
```

Any past jobs/reports that referenced it will just show as
"(store removed)" instead of breaking.

### 2. Log in (required after step 1.7 above)

Once `migration_auth_lockdown.sql` is run, saving a stock report needs
an authenticated session — including from this office app. The app now
has a real login screen, same as the promoter-facing stock app: the
first person to open it taps **"No account yet? Create one"**, enters
an email and password, and that's the office account from then on.
Anyone else who needs access can either use the same login or create
their own — every signed-in account can read and write everything in
this app, there's no per-person permission split.

If you'd rather set an account up ahead of time instead of letting
whoever opens the app first create it, you can also add one directly in
Supabase → **Authentication → Users → Add user**.

If nobody's logged in yet, everything else in the app keeps working —
only saving/editing/deleting Stock tab entries will fail until someone does.

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

- **Analysis tab removed, replaced by a new "Stock" tab** — the old
  view-only Analysis tab (store performance, product performance, shift
  engagement, age range, feedback) is gone. In its place, a new **Stock
  Management** tab sits between Sales and Payout, focused specifically on
  physical stock: an overview of total stock currently on hand at each
  outlet plus total warehouse stock, and — per product per working date —
  the Store Room / Home Shelf / Standee breakdown and the running
  warehouse figure. It's the same expand-by-date, tap-to-edit design as
  the Sales tab, just scoped to location/warehouse fields instead of
  opening/sold/closing. **The Excel export is unchanged** — it still
  produces the exact same sheets (including the former Analysis
  summaries: Products, Store Performance, Shift Engagement, Age Range,
  Feedback) from the Sales tab's Export .xlsx button.
- **Sales tab simplified** — the Sales form and each product's record now
  only cover opening stock, sold/given out, and closing stock, plus a new
  **customer feedback** field at the bottom of every record (what a
  shopper actually said about that product — separate from the existing
  internal `Remarks` note). Stock-by-location and warehouse figures moved
  to the new Stock tab (see above); editing a Sales record no longer
  touches them.
- **New migration: `sql/migration_sales_customer_feedback.sql`** — adds
  the `customer_feedback` column used by the change above. Run it once
  like the others (order doesn't matter relative to the other optional
  migrations, but it must run before the Sales form's feedback field will
  save).


- **Real login** — replaces the old invisible shared "office account"
  with an actual login/create-account screen (email + password), the
  same as the promoter-facing stock app already had. See step 2 above.
- **Hide/show promoters** — no longer just delete-or-keep. "Hide" a
  promoter who's left or is on leave and they disappear from new job/
  stock-log pickers immediately, but their name, past schedule, and pay
  history all stay intact. Hidden promoters sit in a collapsed section
  at the bottom of the Promoters tab, and "Show" brings them straight
  back. This also cuts off their login in the promoter-facing stock app.
- **Gift Set, Flyer, and Small Samples** are now part of the daily
  auto-seeded product list alongside your sellable SKUs, but handled
  differently since they're free: no opening/closing stock tracking (no
  carry-over night to night), and they're excluded from "sold" totals —
  the app just tracks how many were given out, tagged "Free item".
- **Stock report Excel export** — the Stock tab now has the same
  month-picker + Export .xlsx controls as the Reports tab. Same 3-month
  auto-cleanup applies to stock records as to jobs, so export any month
  you want to keep before it ages out.

- **Self-hosted fonts** — headers no longer flash between a fallback
  font and the real one on load, since the font files now ship with the
  app instead of loading from Google Fonts.
- **Day photo row** — each working date now gets one extra row for a
  single overall photo (e.g. the booth/table setup), separate from each
  product's own stock row. Per-product photo upload has been removed —
  a photo is a once-per-date thing, not a once-per-product thing.
  Stored outside Supabase entirely (Cloudinary).
- **Schedule-aware auto-seeded stock rows** — every known product's row
  gets carried forward automatically, but only into the *next working
  date on the schedule* that has actually arrived — not into every
  calendar day. e.g. if the last stock records are from last Sunday and
  the next roadshow day on the Schedule tab is next Saturday, rows only
  get created for Saturday (once it arrives), carrying opening stock
  over from Sunday's closing count.
- **Promoters can now edit any stock entry for today** (not just their
  own), including ones you added from this app — but once a date isn't
  "today" anymore, only this office app can still edit it.
- **Past dates are now locked in this office app too** — once a working
  date is in the past, its stock rows and day photo are locked here as
  well (shown with a 🔒), matching the promoter app. Today's and any
  future-dated entries stay fully editable from here.

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

The app now has a real login screen (email + password, same as the
promoter-facing stock app) instead of the old invisible shared account,
so only people who know an account's credentials can open it. The
`sales_reports` table already required a signed-in session to write to;
promoters/stores/jobs/settings are still on the original open-anon-key
policy from `sql/rls.sql` unless you've also run the optional
`sql/migration_admin_auth_rls.sql` (see step 1.12 above), which locks
those down to signed-in users too, matching sales_reports.

Every account that logs in has full access — there's no per-person role
or permission split (e.g. no "read-only" account). If that's ever
needed, it'd mean adding a roles table and checking it in the RLS
policies, rather than anything client-side.

## Updating the app later

Edit the relevant file in `js/` or `css/`, then re-deploy the folder
(drag to Netlify again, etc.). Your data stays untouched in Supabase —
only the app code changes.

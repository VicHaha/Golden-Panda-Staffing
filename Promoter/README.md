# Golden Panda — Stock Report (standalone)

A lightweight, separate app just for logging sales & stock reports —
built for promoters out in the field, without giving them access to the
Promoters, Schedule, or Reports sections of the main office app.

It talks to the **same Supabase project** as the main app, so anything
logged here shows up instantly in the main app's Stock tab too, and
vice versa. Two different links, one shared database.

## Setup

### 1. Run the SQL migrations (if you haven't already)

These are the same migrations from the main app — if you've already run
them there, skip to the ones you haven't:

In Supabase → SQL Editor, run, in order:
1. `sql/migration_sales_reports.sql` (from the main app's folder)
2. `sql/migration_sales_promoter.sql` (from the main app's folder)
3. `sql/migration_auth_lockdown.sql` — requires a signed-in session to
   add/edit/delete sales reports. Reading still works for anyone with
   the link, same as before.
4. `sql/migration_sales_photo.sql` — adds a `photo_url` column for the
   new photo attachment feature.
5. `sql/migration_day_photos.sql` — creates a `day_photos` table for one
   overall photo per working date, separate from each product's own row.
6. `sql/migration_shift_report_age_range.sql` — adds the customer age
   range field to shift reports.

### 2. Create the office account (required — the office app needs this)

The main office app has no login screen, and isn't getting one — instead
it signs in automatically in the background using one shared account, so
it keeps working under the tightened rule from step 1 above.

1. In Supabase → **Authentication → Users → Add user**.
2. Email: `office@goldenpanda.internal` (or anything you prefer).
3. Password: choose one — this isn't shown to office staff, it's just
   how the app itself authenticates.
4. Open the main office app's `js/supabase.js`, find:
   ```js
   const OFFICE_AUTH_EMAIL = "office@goldenpanda.internal";
   const OFFICE_AUTH_PASSWORD = "REPLACE_WITH_THE_PASSWORD_YOU_SET_IN_SUPABASE";
   ```
   and put in the same email/password you just created. Redeploy the
   office app after this change.

### 3. Turn off email confirmation (recommended)

By default, Supabase makes new accounts click a confirmation link before
they can log in — which needs a working inbox. For promoters signing up
with a quick made-up email, that's extra friction they may not be able
to complete. To skip it:

Supabase → **Authentication → Providers → Email** → turn off **"Confirm
email"**.

If you'd rather keep confirmation on (more secure, requires real email
addresses), that's fine too — promoters will just need to check their
email and click the link once before their first login.

### 4. Set up Cloudinary for stock photos (required for the photo feature)

Stock report photos are hosted on **Cloudinary**, not Supabase — its
free tier gives ~25GB versus Supabase Storage's 500MB, keeping photos
completely separate from your database quota.

1. Create a free account at https://cloudinary.com
2. Your Dashboard shows a **"Cloud name"** near the top — copy it.
3. Go to **Settings → Upload → Upload presets → Add upload preset**.
   Set **Signing Mode** to **Unsigned**. Save, and copy the preset name.
4. Open `js/cloudinary.js` in both this app and the main office app, and
   replace `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_UPLOAD_PRESET` with
   the values from steps 2–3. Redeploy both apps.

Until this is set up, everything else works fine — only the photo
upload button will show an error if tapped.

### 5. Deploy this folder as its own site

Same as before — a **separate** Netlify Drop upload (or separate site)
from the main app, giving you a second, different URL.

### 6. Send promoters the link

First time, each promoter taps **"Create one"** on the login screen,
enters any email + a password of their choosing, then picks their name
from the dropdown (as before). After that, they just log in with their
email/password — the app stays logged in on their phone until they tap
their name at the top and choose to log out.

## How it works

- **First open**: log in or create an account (email + password), then
  pick your name from a dropdown of existing promoters (managed in the
  main app). Both are remembered on that phone going forward.
- **Today's products are pre-filled automatically** — every known SKU
  gets a row for today with opening stock carried over from yesterday's
  closing count, so there's usually nothing to "add," just numbers to
  fill in and save.
- **Gift Set, Flyer, and Small Samples are free giveaways, not sales** —
  they show up in the same daily list, but with no opening/closing stock
  fields, no carry-over, and they're excluded from "sold" totals. Just
  log how many were given out.
- **Editing is locked to today** — any logged-in promoter can edit or
  delete *any* entry dated today, including ones the office added —
  there's no per-person ownership restriction anymore. Once a date is
  no longer today, it's locked (🔒) for everyone here; only the office
  app can still edit past dates.
- **Photos** — attach a photo to any entry (camera or gallery). Stored
  on Cloudinary, not Supabase — see setup step 4.
- **Shift Report tab** — a second tab alongside Stock. Log one entry per
  shift (Before Break 10am–2pm / After Break 3pm–6pm) with people
  engaged, successful engagements, purchases, average engagement time,
  customer age range, and optional customer feedback and notes. Same
  today-only editing rule as stock reports, and it's stored in its own
  `shift_reports` table for analytics.
- **Schedule tab** — a third, view-only tab showing the same rolling
  4-week roadshow calendar as the main office app: date, time, location,
  and position for every scheduled job, not just this promoter's own —
  so promoters can see who else is working where. No pay or commission
  is shown on those shared job cards (office-only), and nothing can be
  added, edited, or deleted from this app — assigning jobs still only
  happens in the main office app. At the top of this tab, each promoter
  sees their **own** current calendar month's total pay (plus commission,
  if any) and shift count — a private total fetched separately, so it
  never exposes anyone else's pay.
- **No promoter management here** — adding/removing promoters still
  happens only in the main office app. If a promoter isn't in the
  dropdown, add them there first.

## Security note

Reports themselves (product names, quantities, photos) are readable by
anyone with the link, even logged out — only *writing* requires a
password, enforced by the database via Supabase Auth, not just hidden
in the UI.

What this doesn't cover: someone could still sign up with a fake email
and pick any promoter's name from the dropdown, since there's no link
verifying that account #123 is really Ahmad and not someone pretending
to be him. If that matters for your use case, the next step up is
having the office create each promoter's login directly (rather than
self-signup) — happy to switch it to that if you'd like.

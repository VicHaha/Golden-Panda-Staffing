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
them there, skip this step; it's the same Supabase project.

In Supabase → SQL Editor, run, in order:
1. `sql/migration_sales_reports.sql` (from the main app's folder)
2. `sql/migration_sales_promoter.sql` (from the main app's folder) —
   this one specifically is required for this app, since it's what lets
   entries be attributed to whoever logged them.

### 2. Deploy this folder as its own site

Same process as the main app, but as a **separate** Netlify Drop upload
(or separate site if you've signed up) — drag this `gp-stock-report`
folder in on its own, not merged with the main app's folder. You'll get
a second, different URL.

### 3. Install it on promoters' phones

Send them the URL. Opening it in Chrome/Safari and tapping "Add to Home
Screen" installs it just like the main app.

## How it works

- **First open**: picks their name from a dropdown of your existing
  promoters (managed in the main app). This is remembered on that phone
  going forward — they won't need to pick it again.
- **Logging**: pick a date (autocompletes from the schedule), optionally
  a store, then product name, opening stock, sales quantity, and closing
  stock. Saved instantly to the same database the office app reads from.
- **Ownership**: a promoter can only edit or delete their own entries —
  everyone can see the full shared list, grouped and collapsible by date,
  but editing someone else's entry is blocked. This keeps multiple people
  logging into the same date without overwriting each other's data.
- **No promoter management here** — adding/removing promoters still
  happens only in the main office app. If a promoter isn't in the
  dropdown, add them there first.

## Security note

Same tradeoff as the main app: there's no password, just the URL and a
name picker. Anyone with the link can log stock as any promoter name.
Fine for a small team with an unpublished link; let me know if you want
real login added later.

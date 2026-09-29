# F. Conisbee & Son — Christmas Orders (website version)

A plain HTML/CSS/JS site (no build step) backed by a free Supabase database, deployed on
GitHub Pages. Multiple staff can use it from different devices at once, logged in with their
own account.

This is a fresh build alongside the Excel workbook, not a replacement — keep the workbook as a
backup until you've trusted this for a full season.

## What you get

- **PWA (installable)** — open the site on a phone/tablet, choose "Add to Home Screen"
  (Safari: Share → Add to Home Screen; Android Chrome: menu → Install app), and it
  behaves like an app: icon on the home screen, opens full-screen with no browser
  address bar. Still needs an internet connection for real data — see "Known
  limitations" below for what this does and doesn't solve.
- **Turkey Allocation Planning** — buckets every Whole Turkey and Crowns/Misc order
  line into 0.5kg weight bands (matching the shop's existing paper planning sheet),
  so you can see how many birds of each size to source, and how many are still
  waiting on a Turkey Number (i.e. not yet matched to a real bird).
- **Checkout** — the counter till: ring up walk-in sales by weight (auto-priced from
  the catalog, same as Order Entry) or by quantity, take cash or card, calculate
  change, and print a receipt. Separate from the pre-order system below — no
  customer needed, paid in full on the spot.
- **Dashboard** — same KPIs as the Excel dashboard (Total Order Value, Deposits, Balance
  Outstanding, Unassigned), plus a live bar chart.
- **Order Entry** — pick a customer (or create one inline), add weighed line items, turkey
  pricing auto-fills from the weight tier, save.
- **Customer Search** — profile, order/balance history, record a payment.
- **Invoice** — pick an order, generate a printable invoice, "Print / Save as PDF" uses the
  browser's own print dialog (choose "Save as PDF" as the destination — no PDF library needed).
- **Marketing** — filter customers, export a CSV.
- **Unassigned Review** — the same £286.89 in orphaned transactions, with a "Resolve to
  Customer" workflow that can also create a brand-new customer on the spot.

## 1. Create the database (Supabase — free)

1. Go to [supabase.com](https://supabase.com), sign up, **New Project**. Pick any name/region,
   set a database password (save it somewhere — you likely won't need it again, but keep it).
2. Wait ~2 minutes for it to provision.
3. Left sidebar → **SQL Editor** → **New query**. Paste the contents of `supabase_schema.sql`
   from this folder → **Run**.
4. New query again → paste `supabase_seed.sql` → **Run**. This loads the same real customers,
   orders, products, and unassigned transactions already reconciled from your Excel file.
5. Left sidebar → **Project Settings** (gear icon) → **API**. Copy:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (a long string starting with `eyJ...`)

## 2. Create staff logins

There's no public sign-up page — that's intentional, so random people can't create accounts.

1. Left sidebar → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Enter each staff member's email and a temporary password. Untick "Auto Confirm User" only if
   you've set up email sending; otherwise leave it ticked so they can log in immediately.
3. Repeat for everyone who needs access. They can log in with these credentials right away —
   there's no separate "accept invite" step needed if auto-confirm is on.

## 3. Configure the site

1. Open `app.js` in this folder.
2. Near the top, replace:
   ```js
   const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
   const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
   ```
   with the two values you copied in step 1.5. Save the file.

The `anon` key is meant to be public — it only allows what your Row Level Security policies
allow (logged-in staff, full access; everyone else, nothing). Don't paste the separate
`service_role` key anywhere in this site.

## 4. Put it on GitHub Pages

1. Create a new **GitHub repository** (Settings can be Private or Public — Private is fine,
   GitHub Pages works with both on paid plans; on a free personal account, Pages requires the
   repo to be **Public**. If you want it private, use a GitHub Pro/Team plan, or ask and I can
   point you to an alternative free host that supports private static sites).
2. Upload these files to the repo root: `index.html`, `style.css`, `app.js`, `manifest.json`,
   `service-worker.js`, `supabase_schema.sql`, `supabase_seed.sql` — plus the `icons` folder
   (with `icon-192.png` and `icon-512.png` inside it). The two `.sql` files are just for
   reference — they don't need to be public, but it's harmless since they contain no secrets,
   only table structure and already-known business data.
   - Easiest way with no command line: on the repo page, **Add file → Upload files**, drag
     everything in (folders included), commit.
3. Repo → **Settings → Pages**. Under "Build and deployment", set **Source: Deploy from a
   branch**, **Branch: main**, folder **/ (root)**. Save.
4. Wait 1-2 minutes, then refresh that Settings → Pages screen — it'll show a URL like
   `https://yourusername.github.io/your-repo-name/`. That's the live site.

## 5. First login

Open the URL from step 4.4, log in with one of the staff accounts you created in step 2. You
should land on the Dashboard and see the real £622.77 total order value, £90 in deposits, and
the 4 unassigned transactions — same numbers as the Excel workbook, because it's the same data.

## Updating the site later

Any time you edit `index.html`, `style.css`, or `app.js`, just re-upload the changed file(s)
through the same **Add file → Upload files** screen (GitHub will ask to confirm overwriting) —
GitHub Pages picks up the change automatically within a minute or two.

## Known limitations of this first build

- **Turkey Number allocation is entry-only right now** — you set Type/Weight
  Mode/Range/Turkey Number when you first save an order line under Order Entry.
  There's no separate "go back and allocate a bird to an existing order" screen
  yet — for now, that means re-entering the line, or editing the row directly in
  Supabase's Table Editor. Flag it if this becomes a real workflow need and I'll
  add a dedicated allocation screen.
- **PWA "Add to Home Screen" gets you the app-like feel, not offline data.** The
  service worker only caches the app shell (HTML/CSS/JS/icons) so it loads fast
  and works if the network blips mid-load — every actual order/customer/sale
  lookup still needs a live connection to Supabase. If the shop's wifi is the real
  problem, a PWA alone won't fix it; that needs the native offline-sync app
  discussed separately (a much bigger build).
- **Invoice numbers are derived, not a separate incrementing ledger** — an invoice is always
  `INV-` + the customer ID (e.g. `INV-C001`), not a strictly sequential `INV-5001, 5002, ...`
  counter like the Excel version had. Simpler, and still unique per customer — but flag if you
  specifically need sequential invoice numbers for accounting purposes and I'll add a proper
  counter table.
- **No delete/edit on saved order lines from the UI yet** — if a line is wrong, the quickest fix
  right now is directly in the Supabase Table Editor (Dashboard → Table Editor → order_details).
  Happy to add an edit/delete button if that comes up often.
- **No offline support** — needs an internet connection (it's talking to Supabase on every
  action). Fine for a shop counter with wifi, not fine for a market stall with no signal.
- **The `anon` key is visible in your public repo's `app.js`.** This is normal and expected for
  Supabase's design (the key alone can't bypass Row Level Security), but it does mean: don't
  ever paste the `service_role` key here, and don't weaken the RLS policies to "allow anon
  access" as a shortcut, since that really would open the data to anyone.
- I haven't been able to test this against a live Supabase instance from my side (no network
  access to Supabase from here) — this is a first cut. After you deploy it, try logging in and
  saving one test order; if anything breaks, send me the exact error and I'll fix it.

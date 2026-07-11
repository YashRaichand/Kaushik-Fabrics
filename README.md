# Fabrique — Circular Fashion Marketplace

A real, working full-stack app: users sign up, list clothes (via a structured
form or free-text NLP), get an instant AI-formula price, book a pickup, and
get paid into an in-app wallet — with live environmental-impact counters and
an admin analytics dashboard. Built to deploy directly on **Render** with
zero manual server setup.

## Stack
Node.js + Express + PostgreSQL + EJS + Tailwind (CDN, no build step).

## What's actually implemented (not mocked)
- Real auth: bcrypt password hashing, JWT cookie sessions, protected routes
- Real dynamic pricing engine (`utils/pricing.js`) — material × condition ×
  brand × demand × bulk-quantity formula, fully unit-testable
- Real rule-based NLP intake (`utils/nlp.js`) — parses free text like
  *"I have 6 old jeans and 3 cotton shirts, jeans are a bit torn"* into
  structured items with quantity/category/material/condition
- Real Postgres schema with foreign keys and indexes, self-initializing on boot
- Real wallet ledger (transactions table), Green Points ledger
- Real admin analytics computed with live SQL aggregates (no fake numbers)
- **Real photo upload** (`utils/upload.js`) — up to 4 images per garment,
  validated by MIME type (JPEG/PNG/WEBP only — rejects SVG, PDFs, and other
  disguised uploads) and 3MB size limit, stored in Postgres as base64
- **Admin-only pickup confirmation queue** (`/admin/pickups`) — every
  scheduled pickup with the customer's phone, email, and address, plus
  photos of each item, and a "Confirm Collected & Pay" action. This is a
  deliberate security fix: an earlier version let any logged-in user
  self-confirm their own pickup and credit their own wallet without ever
  handing over clothes. That self-service action has been removed entirely;
  only an admin account can trigger a wallet credit now.
- **Admin "All Submissions" view** (`/admin/garments`) — every garment ever
  listed, structured form or free-text NLP, with the raw description text
  and photos, regardless of whether a pickup has been booked yet. Booking a
  pickup is the only place an address gets collected, so this is the view
  that surfaces a customer's raw request before that point.
- **Correct, explicit timestamp handling** (`utils/format.js`) — `created_at`
  columns are true `TIMESTAMPTZ` values, explicitly converted to India time
  for display (`formatIST`) regardless of what timezone the server happens
  to run in. A customer's chosen pickup slot (`scheduled_at`) is
  deliberately timezone-naive (`formatWallClock`) since it's a wall-clock
  choice in a single-timezone business, not an absolute instant — mixing
  the two up is what caused inaccurate-looking times before this fix.
- **Genuine real-time dashboards** — `/admin`, `/admin/pickups`, and
  `/admin/garments` poll a lightweight JSON endpoint (`/admin/api/activity`)
  every 8 seconds. KPI numbers update in place with a brief highlight flash
  (no page reload); new pickups/listings trigger a banner with a one-click
  refresh. This is polling, not a live WebSocket push - said plainly because
  "real-time" gets overclaimed a lot: it's a small, honest interval, not an
  instant push, and the endpoint deliberately returns only counts/ids, never
  the full photo data, to keep it cheap to poll.
- **Indian currency formatting** (`formatINR`) — every rupee amount site-wide
  uses proper lakh/crore digit grouping (e.g. "1,23,456.79") instead of
  generic Western thousands grouping.
- **"Get an Instant Quote" now actually delivers one** — `/sell` no longer
  requires an account. A visitor gets a real, fully-computed price with
  zero database writes and zero login wall. If they like it and sign up (or
  log in), their submission is carried through automatically via a
  short-lived cookie and turned into a real listing the moment they have an
  account - no re-typing anything. Price is always recomputed fresh at that
  point rather than trusted from the cookie. Photos aren't carried through
  the guest flow (cookies can't hold image data) - the guest is prompted to
  add them after signing in.
- **Landing page impact stats reframed** — instead of leading with fragile
  live totals that look small at pilot scale (which reads as "nobody uses
  this" to a new visitor), the page now leads with true per-garment facts
  (water/CO₂ saved per item - real numbers, true regardless of current
  volume) and keeps the live count as a small, growth-framed secondary line.

## Deploying to Render (manual — using your existing Postgres)

This project does **not** use `render.yaml` / Blueprint deploy, so it won't
provision a new database. It connects to whatever Postgres instance you
already have via `DATABASE_URL`.

1. Push this folder to a GitHub repository.
2. Render dashboard → **New → Web Service** → connect the repo.
3. Build Command: `npm install`. Start Command: `npm start`.
4. Add environment variables: `DATABASE_URL` (Internal Database URL of your
   existing Postgres instance — same Render region), `JWT_SECRET` (any long
   random string), `NODE_ENV=production`.
5. Deploy. On boot the app runs `db/schema.sql` automatically
   (`CREATE TABLE IF NOT EXISTS ...`) — safe to run against a shared
   database, it only touches its own tables (`users`, `garments`,
   `pickups`, etc.) and won't collide with unrelated tables.

### Making yourself an admin
Signup always creates a `role='user'` account. To view `/admin`, use the
built-in bootstrap page — **no local tools, no paid Render features, no
psql install required:**

1. On Render, open your Web Service → **Environment** tab → add a new
   variable: `ADMIN_BOOTSTRAP_SECRET` set to any long random string you
   make up. Save (triggers a redeploy).
2. Visit `https://your-app.onrender.com/admin-bootstrap?secret=<that string>`
3. Enter the email of the account you want to promote. Submit.
4. Log out and back in on that account — you'll see **Admin** in the nav.

This route 404s for anyone who doesn't have the exact secret (indistinguishable
from a page that doesn't exist), and never queries the database at all if the
secret is wrong. It's safe to leave in place permanently as a "break glass"
tool — just don't share the secret.

(Render's Postgres dashboard does **not** have a browser-based SQL console,
free or paid — that's a web-service-only, paid feature and doesn't apply to
databases. If you ever need direct SQL access, the free path is: Postgres
page → **Connect** → copy the `PSQL Command` → paste into a terminal with
`psql` installed locally.)

## Running locally

```bash
npm install
cp .env.example .env   # fill in a local DATABASE_URL and JWT_SECRET
npm start
```

Requires a local or hosted PostgreSQL instance — point `DATABASE_URL` at it.
The schema self-creates on first boot.

## Project structure

```
fabrique/
├── server.js            # Express app entrypoint
├── render.yaml           # Render deployment blueprint (web + Postgres)
├── db/
│   ├── schema.sql         # Self-initializing table definitions
│   └── db.js              # pg Pool + init logic
├── middleware/
│   └── auth.js            # JWT cookie auth guards
├── utils/
│   ├── pricing.js          # Dynamic pricing formula engine
│   └── nlp.js               # Rule-based free-text intake parser
├── routes/
│   ├── auth.js, garments.js, pickups.js, dashboard.js, admin.js
└── views/                 # EJS templates (Tailwind CDN, no build step)
```

## Known limitations (honest, by design for a Phase-0 MVP)
- **AI image grading** is not included — photos are stored and shown to the
  admin for manual visual verification, but nothing analyzes them
  automatically yet (no material/condition detection from the image itself).
  Wiring in a real vision model is the natural next milestone once you have
  a real corpus of user-submitted photos to train or fine-tune on.
- **Pricing is a deterministic formula**, not a trained ML model — this is
  intentional for Phase 0 (no transaction data exists yet to train on). The
  formula is structured so swapping in a trained model's output later is a
  one-function change in `utils/pricing.js`.
- **No GPS/live map tracking** — pickup "tracking" is a status field
  (scheduled → completed), not a live map with agent location.
- **Payments are wallet-only** (no real Razorpay payout integration yet) —
  the admin pickup queue is where a real payout API call would replace the
  current wallet-credit call, once you're ready to move real money.
- **Images are stored as base64 in Postgres**, not a dedicated object store
  (S3/Cloudinary). Fine at pilot scale; worth migrating before high volume.

# Khaya Kos — Live-Editable Site

A real-time editable version of the Khaya Kos site. Products (name,
description, price, photo) can be edited live by the owner and every visitor
sees the change instantly via WebSocket — no page refresh needed.

## Why Upstash Redis, and why it's genuinely free

Render's free web service tier wipes its local disk every time the service
restarts or spins down from inactivity (which happens after 15 minutes with
no visitors) — so product edits can't live on Render's own filesystem.

This app persists all product data to **Upstash Redis** instead, reached
over plain HTTPS. It was chosen specifically because, compared to the other
free options:

- **MongoDB Atlas (free M0)** auto-pauses after 30 days of no database
  activity — recoverable, but a real gap if the site goes quiet.
- **Supabase (free tier)** auto-pauses after just **1 week** of inactivity.
- **Upstash Redis (free tier)** does **not** auto-pause, ever. It's a true
  pay-per-request model with a monthly free allowance — 500,000 commands
  and 256MB of storage per month, at no cost, no credit card required. This
  site will use a tiny fraction of that (our entire product catalog is a
  few KB, and even daily edits are a handful of requests).

Combined with Render's free web service, this gives a **$0/month stack**
where product data survives restarts, spin-downs, and redeploys. This was
tested directly: change a price, kill the server entirely, restart it —
the change is still there, loaded from Upstash instead of the seed file.

## One-time setup: create your free Upstash database

1. Go to [upstash.com](https://upstash.com) and sign up (no credit card).
2. Click **Create Database**, give it a name (e.g. `khaya-kos`), pick a
   region close to your users (e.g. an EU or nearest-available region for
   South Africa), and create it on the **Free** plan.
3. On the database's page, find the **REST API** section and copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. You'll add both as environment variables on Render (step 5 below).

That's it — the app handles everything else automatically, including
seeding the database with the starting menu the first time it runs.

## Local development

```bash
npm install
ADMIN_PASSWORD=yourpassword \
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io \
UPSTASH_REDIS_REST_TOKEN=your-token \
npm start
```

If you skip the two `UPSTASH_*` variables, the app still runs — it just
falls back to the bundled seed file with no persistence between restarts,
which is fine for quick local testing. If you don't set `ADMIN_PASSWORD`,
it falls back to `khayakos-dev-2026` for local testing only — never leave
that unset in production.

## Responsive support

The frontend supports viewport widths of **280 CSS pixels and wider**. The
intentional 280 px minimum preserves usable product cards and owner editing
controls; narrower embedded views are outside the supported layout range.

## Deploying to Render

1. Push this folder to a GitHub repo.
2. On Render: **New → Web Service**, connect the repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Under **Environment**, add:
   - `ADMIN_PASSWORD` — a real password, not the dev fallback.
   - `UPSTASH_REDIS_REST_URL` — from your Upstash database.
   - `UPSTASH_REDIS_REST_TOKEN` — from your Upstash database.
6. Deploy.

Render's free tier will still spin the *server* down after 15 minutes of no
visitors, so the very first visit after a quiet spell takes 30-60 seconds to
wake up — that's a Render limitation with no free workaround, but it's a
speed bump, not data loss. Your product data itself is safe in Upstash the
entire time.

## Editing products on the live site

1. Click **🔒 Owner Login** (bottom-left) and enter the password.
2. Click any product name or description to edit it, click the price to
   change it, or hover a photo to replace it.
3. Click **➕ Add Item** at the end of a row to add a new product, or the
   **✕** on a card to remove one.
4. Every change is instant for anyone else currently on the site, and is
   saved permanently to Upstash — it'll still be there next week, next
   month, whenever.
5. Click **🔓 Exit Edit Mode** when you're done.

## Two things still worth doing

- **WhatsApp number**: still a placeholder (`27000000000`). It lives in
  `public/js/admin/renderer.js` (the `WHATSAPP_NUMBER` constant — used by
  every product card) and in two links inside `public/index.html`.
- **Map pin**: `public/index.html` still uses a text-search map embed for
  Gazebo Valley — swap in an exact pin when you have one.

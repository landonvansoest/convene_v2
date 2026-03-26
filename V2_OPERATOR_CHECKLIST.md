# Convene v2 — unresolved issues

**What this file is:** A **short list of what is still open**. When something is decided or shipped, **remove its line** (or uncheck if you prefer keeping history—your call).

**What this file is not:** A full runbook. For Stripe, env vars, SQL order, cron, and expanded launch notes use **`V2_REMAINING_WORK.md`**, **`apps/web/.env.example`**, and **`supabase/v2/*.sql`**.

**Source of truth:** **`docs/bible/convene_bible_032526.rtf`** (product + data contract). Put **decided** policy there; don’t let this file grow into a second Bible.

**How we work:** Ask plain-language questions **in chat**; keep **only leftovers** here.

---

## Legal / compliance (TBD)

- [ ] Footer: **privacy, terms, cookies** — before launch or after?
- [ ] Community requests: need **disclaimers** (e.g. no guarantee of replies)? Counsel to advise.

## Build / data (no further product question)

- [ ] **Online Now:** implement **`users.online`** from **last action or heartbeat within 5 minutes** (and expose safely on public expert/search APIs for badges).
- [ ] DB: if any **`expert_availability.rate`** (or related) is still **hourly** from v1, migrate **÷ 4** to **per 15 minutes**.
- [ ] Search filter **“Available now”** = bookable slot within **1 hour** (API + UI).
- [ ] Homepage: admin **show on homepage** per category + strip uses it.
- [ ] **OAuth:** Google, Facebook, Apple in Supabase + app.
- [ ] **Magic links:** signup confirm → **registration wizard**; password reset → **homepage**; map any other links once listed above.
- [ ] **Expert books expert:** clear **learner vs coach** relationship in UI (and data if needed).
- [ ] **Messaging:** primary UX = **modal / dashboard**; avoid standalone **`/messages`** as the main path for normal users.
- [ ] **Reviews:** submit in **modal**; display on **profile** (no standalone review page).
- [ ] **Average response time** on profiles (define metric, e.g. median hours to first reply) + job/API.

## Ops (until production is boring)

- [ ] Production Supabase: run **`001`–`010`** (includes **`featured_experts_settings`** for browse/homepage expert list), backups, smoke-test **`003`** (auth → **`public.users`**).
- [ ] Host env matches **`apps/web/.env.example`** (`CRON_SECRET`, Stripe webhook secret, `NEXT_PUBLIC_APP_URL`, SendGrid sender, …).

---

## Bible updates to apply (based on your answers)

- **Terminology:** reserve **“session”** for the active video call only; use **“booking(s)”** for everything else to avoid confusion (e.g. reword headings like “Booked Sessions” to “Bookings” where appropriate).
- **Categories:** only **active** categories show publicly; if an active category has **no professional titles yet**, hide it from user-facing browsing but still allow it during **expert registration**.
- **`/sessions` access + labels:** `'/sessions'` should not be treated as a standalone product page; the “Your sessions” area should be accessible only via the **dashboard sidebar** (experts and learners).
- **Email reminders:** besides signup confirmation + password reset, reminders sent 10 minutes before a booking’s start should include a **“Join session”** link.
- **Online Now badge:** `users.online = true` when **last user action or heartbeat** was within the last **5 minutes** (not “since login”); `false` after **5+ minutes** without activity/heartbeat or on **explicit sign-out**. Heartbeat only while the tab is reasonably “active” (e.g. foreground / visible), per engineering.

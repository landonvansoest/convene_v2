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
- [ ] **Help Tickets inbox** (Bible §"Admin tools — Help Tickets") — admin help-desk inbox now lives in **Admin → Help Tickets**. Users open tickets from the footer "Contact Us" dialog (and authenticated users from a future "My support tickets" view). Admin replies are emailed via SendGrid; reply CTA links back to `/help/[ticketId]`. Before launch:
  - Apply migration **`044`** (`help_tickets`, `help_ticket_messages`, status enum, parent-refresh trigger).
  - Confirm `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` are set in production env. Without them, admin replies are still saved in-app but the user does not receive an email — the dashboard surfaces this in the success toast.
  - Optional but recommended: point `SENDGRID_FROM_EMAIL` at a real mailbox you monitor (e.g. a Gmail or a Google Workspace alias) so any stray reply-by-email from users still reaches a human.
  - **Communicate to users that they cannot reply to help tickets via email — replies happen in Convene at `/help/[ticketId]`.** The notification email already says this; consider adding the same line to any other outbound transactional templates that reference support.
- [ ] **Dependability ratings** (Bible §"Dependability Rating") — per-booking scores are now written by the app on every event (cancellation, reschedule-suggestion, late-join, no-show / complete via cron) and rolled into `users.learner_dependability_rating` / `expert_profiles.expert_dependability_rating` by a Postgres trigger. Before launch:
  - Apply migration **`043`** (`recompute_user_dependability_ratings` + bookings trigger + backfill from existing per-booking scores).
  - Verify `/api/cron/finalize-no-show-sessions` is reachable so terminal-status bookings get their score (and the user rolling average) updated.
  - Optional: spot-check the dashboard "Dependability" stat for a test user after a cancelled booking — it should reflect the deduction instead of staying at 100/`—`.
- [ ] **Search engine** (Bible §"Search engine contract") — server-side hybrid FTS + OpenAI query expansion now lives at `GET /api/search/experts`. Before launch:
  - Apply migrations **`039`** (search_vector backfill + triggers), **`040`** (`search_experts_keyword`), **`041`** (expansion cache + mode_version triggers), **`042`** (boost params).
  - Confirm `OPENAI_API_KEY` is set in production env (semantic + hybrid degrade to keyword without it, silently).
  - Optional ops: weekly metric on `search_query_expansion_cache` row count / hit rate so we notice if expansion is being skipped (missing key, timeouts, etc.).
  - `?mode=keyword` URL flag forces the keyword leg only — handy for A/B checks.
- [ ] Homepage: admin **show on homepage** per category + strip uses it.
- [ ] **OAuth:** Google, Facebook, Apple in Supabase + app.
- [ ] **Magic links:** signup confirm → **registration wizard**; password reset → **homepage**; map any other links once listed above.
- [ ] **Expert books expert:** clear **learner vs coach** relationship in UI (and data if needed).
- [ ] **Messaging:** primary UX = **modal / dashboard**; avoid standalone **`/messages`** as the main path for normal users.
- [ ] **Reviews:** submit in **modal**; display on **profile** (no standalone review page).
- [ ] **Average response time** on profiles (define metric, e.g. median hours to first reply) + job/API.

## Ops (until production is boring)

- [ ] **Stripe Connect required for bookings** — Vercel currently bypasses the expert `stripe_connect_account_id` gate (`VERCEL=1` in `isSessionPaymentTestBypassAllowed`). **Before launch:** remove that Vercel bypass from `dev-session-payment-test.ts`, set `ALLOW_PAYMENT_BYPASS=false`, turn OFF Admin → DEV Tools → `payment_bypass_session`, and verify booking an expert without completed Stripe Connect payout setup returns **“Expert payment setup not complete”** instead of allowing checkout.
- [ ] **Supabase Auth → URL Configuration → Redirect URLs:** before production, replace any **`http://localhost:3000/...`** entries with your live origins. Required paths include **`/auth/callback`** (OAuth / default PKCE) and **`/auth/callback/signup/complete`** (email confirm + dev bypass → then redirect to learner wizard at **`/auth/callback/signup`**); use the real **`https://<production-domain>/...`** values.
- [ ] Production Supabase: run **`001`–`010`** (includes **`featured_experts_settings`** for browse/homepage expert list), backups, smoke-test **`003`** (auth → **`public.users`**).
- [ ] Host env matches **`apps/web/.env.example`** (`CRON_SECRET`, Stripe webhook secret, `NEXT_PUBLIC_APP_URL`, SendGrid sender, …).
- [ ] **Vercel Cron:** verify `apps/web/vercel.json` is picked up on first deploy and the cron jobs are registered in **Vercel Project → Settings → Cron Jobs**:
  - `/api/notifications/check-booking-reminders` — every 2 min (booking reminder emails)
  - `/api/cron/finalize-no-show-sessions` — every 5 min (settles no-shows after the wall clock)
  - `/api/cron/sweep-online-presence` — every 2 min (flips `users.online = false` when `last_seen_at` is older than 5 min; backstop for tab crashes that miss the offline beacon)
  - `/api/cron/freelance-auto-release` — every 15 min (auto-releases freelance payouts after 3-day learner silence; escalates `paid_in_progress` rows to `admin_review` after expert misses work deadline + 3-day grace)
  - `/api/cron/check-package-credit-expiration-reminders` — daily (emails learners at ~1 mo / 2 wk / 1 wk / 3 d before unused package credits expire)

  All five authenticate with `CRON_SECRET`; smoke-test each from the Vercel Cron dashboard or with a manual `curl -H "Authorization: Bearer $CRON_SECRET" …` after deploy.

- [ ] **Freelance lifecycle** (Bible §"Special bookings — lifecycle" / §"freelance_work — status enum") — the full 8-status state machine, SLA fields, and admin review queue now live in the app. Before launch:
  - Apply migration **`046`** *then* **`047`** as separate runs. `046` only mutates the `freelance_work_status` enum (renames `approved`→`paid_in_progress` and `complete`→`completed`, adds `declined / accepted_pending_payment / completion_submitted / refunded / admin_review`); `047` adds the new columns, backfills SLA timestamps, creates the cron/admin indexes, and installs the `freelance_compute_sla` helper. They MUST run as two separate transactions — Postgres won't let newly-added enum values be referenced in DDL until the transaction that added them has committed (Supabase's SQL editor wraps each run in one transaction).
  - Confirm the `freelance-auto-release` cron above is wired and authenticating.
  - Expert payout transfer: this codepath flips `payout_released_at` and writes a `transactions` ledger row, but does **not** yet trigger a Stripe Connect transfer. If you want real money movement at completion, add a `stripe.transfers.create` call inside `lib/stripe/finalize-freelance-payment.ts` (charge time) or in a dedicated payout handler keyed off `payout_released_at`. Document the choice in the Bible's Payments section.
  - Refunds: `admin_review → refunded` currently writes `refunded_amount_cents` for bookkeeping but does not issue the Stripe refund itself — admin still needs to refund via Stripe Dashboard (or extend the existing booking-refund tooling to also accept a `freelanceId`).
  - Test path: create a freelance row, accept & pay as the learner, mark complete as the expert, then either accept-completion (immediate completed) or wait 3 days for the cron to auto-release.

---

## Bible updates to apply (based on your answers)

- **Terminology:** reserve **“session”** for the active video call only; use **“booking(s)”** for everything else to avoid confusion (e.g. reword headings like “Booked Sessions” to “Bookings” where appropriate).
- **Categories:** only **active** categories show publicly; if an active category has **no professional titles yet**, hide it from user-facing browsing but still allow it during **expert registration**.
- **`/sessions` access + labels:** `'/sessions'` should not be treated as a standalone product page; the “Your sessions” area should be accessible only via the **dashboard sidebar** (experts and learners).
- **Email reminders:** besides signup confirmation + password reset, reminders sent 10 minutes before a booking’s start should include a **“Join session”** link.
- **Online Now badge:** `users.online = true` when **last user action or heartbeat** was within the last **5 minutes** (not “since login”); `false` after **5+ minutes** without activity/heartbeat or on **explicit sign-out**. Heartbeat only while the tab is reasonably “active” (e.g. foreground / visible), per engineering.

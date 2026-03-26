# Convene v2 — remaining work (expanded notes)

**Canonical “what’s left” scratch pad:** **`V2_OPERATOR_CHECKLIST.md`** (unresolved only). This file is **expanded** hosting, Stripe, security, and QA notes—work through it when you’re past day-to-day product Q&A.

In-repo hardening already done includes: Stripe webhook dedupe for **checkout.session.completed** and **subscription** events (migration **`009`** + handler), baseline **security headers** on all routes, **`publicApiError`** for API JSON errors in production, and **`/api/health`** flags for key secrets (presence only, no values).

Use **`apps/web/.env.example`**, **`supabase/v2/*.sql`**, and the sections below for SQL order, env, Stripe Dashboard, and cron detail.

---

## 1. Database & Supabase

- [ ] Apply **`supabase/v2/009_stripe_webhook_idempotency.sql`** in your v2 project (after **`001`–`008`**). Webhooks will error on the dedupe query/insert until the table exists.
- [ ] Confirm **`003_auth_users_sync.sql`** trigger is active and new Auth users get **`public.users`** rows.
- [ ] Backups, PITR, and a **restore drill** for the v2 project.
- [ ] Optional: **RLS** on selected tables for future anon/authenticated direct access; today most writes go through Route Handlers with the **service role** — document who may call what before turning RLS on.
- [ ] Optional: retention / purge job for **`processed_stripe_webhook_events`** (index on `received_at` supports time-based deletes).

---

## 2. Environment & deployment

- [ ] Production **Vercel** (or other) env: all vars from **`apps/web/.env.example`**, including **`CRON_SECRET`**, **`STRIPE_WEBHOOK_SECRET`**, **`SUPABASE_SERVICE_ROLE_KEY`**, **`DAILY_API_KEY`**, admin secrets.
- [ ] **`NEXT_PUBLIC_APP_URL`** matches the canonical deployed origin (Stripe return URLs, Connect, email links).
- [ ] Separate **Stripe live** vs test keys; webhook endpoint URL for production.
- [ ] If not using Vercel Cron, schedule **`/api/notifications/check-booking-reminders`** with **`Authorization: Bearer <CRON_SECRET>`** (or query secret per your implementation).

---

## 3. Stripe (production matrix)

- [ ] **Connect**: Express onboarding tested end-to-end; payouts and **application_fee** / transfer behavior verified on a real test account where possible.
- [ ] **Webhooks**: same event types as checklist §3; verify **package purchase**, **subscription checkout**, **session PI**, and **freelance PI** paths in Stripe test mode with retries and duplicate deliveries.
- [ ] **Tax / invoices / customer portal** as required by your jurisdiction and product.
- [ ] **Refunds and disputes**: policy and whether ledger **`transactions`** / bookings need reversal rows or manual admin tools (not fully automated in v2).
- [ ] **Minimum charge amounts** (e.g. first-session discount edge cases, sub-minimum totals).

---

## 4. Security & abuse

- [ ] **Rate limiting** on public and authenticated API routes (especially login-adjacent, webhooks already signature-gated).
- [ ] **CSP** (stricter than headers-only) if you add third-party scripts or embeds.
- [ ] **Admin routes**: confirm **`ADMIN_DASHBOARD_SECRET`** / **`ADMIN_EMAIL`** policy; audit **`assertAdmin`** usage on every admin handler.
- [ ] **Service role**: never expose to the browser; rotate if leaked.
- [ ] **`NOTIFICATION_WEBHOOK_SECRET`** and message ingress reviewed for replay/forgery if exposed publicly.

---

## 5. Observability & operations

- [ ] Central **logging** (structured JSON) and **alerting** on 5xx, webhook failures, and cron failures.
- [ ] **Stripe Dashboard** + Supabase logs for payment anomalies; define on-call or owner.
- [ ] **`/api/health`**: optional extend with a non-destructive Stripe API ping (careful with rate limits) or keep as config + DB liveness only.

---

## 6. Product / Bible gaps (feature backlog)

- [ ] **Ledger semantics**: full story for discounts, partial refunds, currency, and reconciliation with Stripe balance transactions.
- [ ] **Search / discovery** beyond list + filters (if in Bible).
- [ ] **Notifications**: email/SMS templates, deliverability, unsubscribe (Twilio/Sendgrid vars are optional today).
- [ ] **Expert/learner** edge flows: cancellations, reschedules, no-shows, payouts timing.
- [ ] **Packages**: credit expiry, partial use, reporting.
- [ ] **Freelance**: revisions, disputes, milestone payments if required.
- [ ] **Data migration** from v1 (if any): users, experts, historical sessions — not in v2 SQL folder by default.

---

## 7. QA — golden paths (manual or automated)

- [ ] **Learner**: sign up → book session → pay (PI) → webhook → booking paid → join Daily room → review.
- [ ] **First-session discount**: eligible expert, date window, PI success, **`discount_redemptions`** row.
- [ ] **Package**: checkout completed → credits + **`transactions`** idempotency (duplicate webhook).
- [ ] **Expert**: onboard → Connect → availability → incoming booking; **mark complete** / status transitions.
- [ ] **Freelance**: create → approve → pay → webhook → expert complete when paid.
- [ ] **Subscription**: checkout + portal + webhook subscription sync.
- [ ] **Admin**: pending experts, categories, grant package credit.

---

## 8. Legal & compliance

- [ ] Privacy policy, terms, cookie/consent if required.
- [ ] **PCI**: Stripe.js / Checkout keep card data off your servers — document what you store (metadata only).
- [ ] Regional rules (GDPR export/delete, etc.) if you serve EU/UK users.

---

## 9. Performance & cost

- [ ] Load test hot routes (**experts list**, **availability**, **sessions** creation).
- [ ] Supabase query review (indexes already in migrations; add as usage patterns emerge).
- [ ] Daily.co usage and room lifecycle (cleanup if Bible requires).

---

*When a section is done, remove the matching line from **`V2_OPERATOR_CHECKLIST.md`** (or check boxes there). You can trim or delete this file if you no longer want duplicate narrative.*

# V2 schema (Bible rev3)

SQL in this folder is a **net-new** PostgreSQL schema aligned with `docs/bible/convene_bible_032526.rtf`. It is **not** applied automatically to an existing v1 Supabase project.

**Suggested workflow**

1. Create a **new** Supabase project for v2.
2. Run migrations in numeric order in the SQL editor (or `psql`), after enabling required extensions:
   - `001_extensions_and_enums.sql`
   - `002_core_schema.sql`
   - `003_auth_users_sync.sql` (trigger: new Auth users → `public.users`)
   - `004_expert_stripe_connect.sql` (Stripe Connect account id on experts)
   - `005_booking_reminder_tracking.sql` (idempotent 15m reminder cron)
   - `006_booking_status_cancelled.sql` (`cancelled` on `booking_session_status`)
   - `007_package_credit_checkout_id.sql` (idempotent package checkout → credits)
   - `008_transactions_checkout_session.sql` (ledger idempotency for package Checkout)
   - `009_stripe_webhook_idempotency.sql` (Stripe webhook event dedupe table for subscription + Checkout completion)
   - `010_featured_experts_settings.sql` (singleton row: which `expert_status` values appear on public expert list / featured grid, plus optional filters)
3. Point the v2 Next app at the new project URL and keys: `apps/web` (see `apps/web/.env.example` and `apps/web/README.md`).
4. Operator-facing setup (env, Stripe, cron, reminders): expanded notes in **`V2_REMAINING_WORK.md`**; open items only in **`V2_OPERATOR_CHECKLIST.md`** at the repo root.

**Authority:** If this SQL disagrees with the Bible, **fix the Bible first**, then update this folder.

# Convene web (v2)

Next.js 15 **App Router** + **Route Handlers** per `docs/bible/convene_bible_032526.rtf`. This replaces the Express API over time; the root Vite app is legacy until ported.

## Commands

```bash
npm install
cp .env.example .env.local   # fill values from Supabase v2 project
npm run dev                  # http://localhost:3000
```

From monorepo root:

```bash
npm run dev:web
```

## Database

Run SQL in order from `../../supabase/v2/` (see that README). After **`003_auth_users_sync.sql`**, new Supabase Auth sign-ups get a matching **`public.users`** row (`user_id` = `auth.users.id`).

## Environment

See `.env.example`.

**`SUPABASE_SERVICE_ROLE_KEY`** is required for server routes that read/write `public.users` and other tables without RLS (e.g. **`GET /api/me`**, notifications, Stripe lookup). Never expose it to the browser.

## API routes

| Path | Purpose |
|------|---------|
| `GET /api/health` | Liveness; DB probe if service role + `users` table exist |
| `GET /api/me` | Cookie session + `public.users` profile; upserts profile if missing |
| `POST /api/notifications/webhook/message` | DB/worker hook; Bearer `NOTIFICATION_WEBHOOK_SECRET`; body snake_case or camelCase |
| `GET` / `POST /api/notifications/check-booking-reminders` | Cron; Bearer `CRON_SECRET` or `?secret=`; **v2** `bookings.status = upcoming` |
| `POST /api/stripe/create-payment-intent` | Port of Express; body `{ amount, expertUserId, bookingId? }` (amount in **cents**) |
| `POST /api/stripe/webhook` | Raw body + `stripe-signature`; `STRIPE_WEBHOOK_SECRET` |

Notification dispatch is stubbed in `src/lib/notifications/dispatch.ts` until SendGrid/Twilio are wired.

## Auth

`GET /auth/callback` — Supabase PKCE email/OAuth return. In Supabase Dashboard → Auth → URL config, add redirect: `{ORIGIN}/auth/callback`.

## Deploy (Vercel)

- **Root directory:** `apps/web`
- Set env vars from `.env.example` (including `CRON_SECRET`; Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when configured).
- **`vercel.json`** defines a cron hitting `/api/notifications/check-booking-reminders` every 2 minutes (adjust as needed).
- Stripe Dashboard → webhook URL: `https://<deployment>/api/stripe/webhook`

## Express → Next port map (in progress)

| Legacy (`backend/server.js`) | v2 Route Handler |
|-------------------------------|------------------|
| `GET /health` | `GET /api/health` |
| `POST /api/notifications/webhook/message` | `POST /api/notifications/webhook/message` |
| `GET/POST /api/notifications/check-booking-reminders` | same |
| `POST /api/stripe/create-payment-intent` | `POST /api/stripe/create-payment-intent` |
| `POST /api/stripe/webhook` | `POST /api/stripe/webhook` |
| `GET /api/users/profile` | `GET /api/me` (shape differs; v2 schema) |
| `POST /api/auth/*` | Use **Supabase Auth** client-side + `/auth/callback` (no custom JWT) |

## Porting checklist

1. Add `src/app/api/.../route.ts`.
2. Shared logic → `src/lib/` + Zod.
3. `createAdminClient()` for trusted DB access; `createServerSupabase()` for user-scoped Auth.
4. Point the Vite app (or new UI) from `http://localhost:3001/api` to `http://localhost:3000/api` during cutover, then delete the Express route.

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Liveness: always returns JSON.
 * If service role is configured, runs a trivial DB round-trip.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return Response.json(
      { ok: false, reason: "missing NEXT_PUBLIC_SUPABASE_* env" },
      { status: 503 }
    );
  }

  let db: "ok" | "skipped" | "error" = "skipped";
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createAdminClient();
      const { error } = await admin.from("users").select("user_id").limit(1);
      db = error ? "error" : "ok";
    } catch {
      db = "error";
    }
  }

  const healthy = db !== "error";

  const stripeSecretKey = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const stripeWebhookSecret = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
  const dailyApiKey = Boolean(process.env.DAILY_API_KEY?.trim());
  const cronSecret = Boolean(process.env.CRON_SECRET?.trim());

  return Response.json(
    {
      ok: healthy,
      app: "convene-web-v2",
      database: db,
      stripe_secret_key_configured: stripeSecretKey,
      stripe_webhook_secret_configured: stripeWebhookSecret,
      daily_api_key_configured: dailyApiKey,
      cron_secret_configured: cronSecret,
    },
    { status: healthy ? 200 : 503 }
  );
}

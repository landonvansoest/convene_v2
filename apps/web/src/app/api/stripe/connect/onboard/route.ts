import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { getStripe } from "@/lib/stripe/server";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Creates a Stripe Connect Express account (if needed) and returns an Account Link URL for onboarding.
 */
export async function POST() {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileErr } = await admin
    .from("expert_profiles")
    .select("user_id, stripe_connect_account_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileErr) {
    return Response.json({ error: publicApiError(profileErr) }, { status: 500 });
  }
  if (!profile) {
    return Response.json({ error: "Expert profile required" }, { status: 404 });
  }

  const { data: userRow } = await admin
    .from("users")
    .select("email_address")
    .eq("user_id", userId)
    .maybeSingle();

  let accountId = profile.stripe_connect_account_id?.trim() || null;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: userRow?.email_address ?? undefined,
      business_type: "individual",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { convene_user_id: userId },
    });
    accountId = account.id;
    const now = new Date().toISOString();
    await admin
      .from("expert_profiles")
      .update({
        stripe_connect_account_id: accountId,
        updated_at: now,
      })
      .eq("user_id", userId);
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/expert/connect?refresh=1`,
    return_url: `${appUrl}/expert/connect?complete=1`,
    type: "account_onboarding",
  });

  return Response.json({ url: link.url, accountId });
}

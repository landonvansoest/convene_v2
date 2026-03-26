import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

type SubStatus = "active" | "trialing" | "past_due" | "canceled" | "unpaid";

function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): SubStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    case "incomplete":
    case "incomplete_expired":
    case "paused":
    default:
      return "unpaid";
  }
}

/**
 * Upsert `user_subscriptions` from a Stripe Subscription object.
 * Prefer `metadata.user_id`; otherwise match an existing row by `stripe_customer_id`.
 */
export async function syncUserSubscriptionFromStripe(
  admin: SupabaseClient,
  sub: Stripe.Subscription
): Promise<void> {
  const stripeSubscriptionId = sub.id;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  const metaUserId = (sub.metadata?.user_id ?? "").trim();

  let userId = metaUserId || null;
  if (!userId && customerId) {
    const { data: row } = await admin
      .from("user_subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .limit(1)
      .maybeSingle();
    if (row?.user_id) userId = row.user_id;
  }

  if (!userId) {
    console.info("[stripe] subscription sync skipped: no user_id (metadata or customer match)", sub.id);
    return;
  }

  const status = mapStripeSubscriptionStatus(sub.status);
  const firstItem = sub.items.data[0];
  const priceId = firstItem?.price?.id ?? null;
  const periodStartSec = firstItem?.current_period_start ?? null;
  const periodEndSec = firstItem?.current_period_end ?? null;
  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from("user_subscriptions")
    .select("subscription_id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  const payload = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: stripeSubscriptionId,
    plan_id: priceId,
    status,
    current_period_start: periodStartSec ? new Date(periodStartSec * 1000).toISOString() : null,
    current_period_end: periodEndSec ? new Date(periodEndSec * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    updated_at: now,
  };

  if (existing?.subscription_id) {
    const { error } = await admin.from("user_subscriptions").update(payload).eq("subscription_id", existing.subscription_id);
    if (error) console.error("[stripe] subscription update failed", error.message);
    return;
  }

  const { error: insertErr } = await admin.from("user_subscriptions").insert({
    ...payload,
    created_at: now,
  });
  if (insertErr) console.error("[stripe] subscription insert failed", insertErr.message);
}

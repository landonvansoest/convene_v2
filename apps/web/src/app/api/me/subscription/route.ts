import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

/**
 * Stripe-synced rows from `user_subscriptions` for the signed-in user.
 */
export async function GET() {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_subscriptions")
    .select(
      "subscription_id, stripe_subscription_id, stripe_customer_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ subscriptions: data ?? [] });
}

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

/** Ledger rows where the signed-in user is learner or expert (recent first). */
export async function GET(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "25") || 25, 50);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("transactions")
    .select(
      "transaction_id, transaction_type, booking_id, package_id, expert_user_id, learner_user_id, total_charge, platform_fee, expert_earnings, status, payment_method, transaction_date, created_at, stripe_checkout_session_id"
    )
    .or(`learner_user_id.eq.${userId},expert_user_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ transactions: data ?? [] });
}

import { createAdminClient } from "@/lib/supabase/admin";
import { displayName, getAuthedUserId, getUsersByIds } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");

  const admin = createAdminClient();
  let query = admin
    .from("bookings")
    .select("*")
    .or(`learner_user_id.eq.${userId},expert_user_id.eq.${userId}`)
    .order("session_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (status) query = query.eq("status", status);
  if (type === "upcoming") query = query.gte("session_date", new Date().toISOString().slice(0, 10));
  if (type === "completed") query = query.lt("session_date", new Date().toISOString().slice(0, 10));

  const { data: bookings, error } = await query;
  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const partnerIds = new Set<string>();
  for (const b of bookings ?? []) {
    partnerIds.add(b.learner_user_id === userId ? b.expert_user_id : b.learner_user_id);
  }
  const partners = await getUsersByIds(Array.from(partnerIds));
  const byId = new Map(partners.map((u) => [u.user_id, u]));

  const sessions = (bookings ?? []).map((b) => {
    const partnerId = b.learner_user_id === userId ? b.expert_user_id : b.learner_user_id;
    const partner = byId.get(partnerId);
    return {
      ...b,
      id: b.booking_id,
      learner_id: b.learner_user_id,
      expert_id: b.expert_user_id,
      user_role: b.learner_user_id === userId ? "learner" : "expert",
      partner_name: partner ? displayName(partner) : null,
      partner_photo: partner?.profile_photo ?? null,
      duration_minutes: null,
      total_price: b.total_amount,
      cancellation_reason: b.cancellation_reason,
    };
  });

  return Response.json({ sessions });
}

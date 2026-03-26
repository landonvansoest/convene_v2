import { createAdminClient } from "@/lib/supabase/admin";
import { displayName, getAuthedUserId, getUsersByIds } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: bookingId } = await params;
  const admin = createAdminClient();
  const { data: b, error } = await admin.from("bookings").select("*").eq("booking_id", bookingId).maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  if (!b) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }
  if (b.learner_user_id !== userId && b.expert_user_id !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const partnerId = b.learner_user_id === userId ? b.expert_user_id : b.learner_user_id;
  const partners = await getUsersByIds([partnerId]);
  const partner = partners[0];

  return Response.json({
    booking: {
      ...b,
      id: b.booking_id,
      user_role: b.learner_user_id === userId ? "learner" : "expert",
      partner_name: partner ? displayName(partner) : null,
      partner_id: partnerId,
    },
  });
}

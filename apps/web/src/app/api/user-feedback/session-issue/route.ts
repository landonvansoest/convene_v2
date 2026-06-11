import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

const feedbackTypes = z.enum([
  "session_technical_interruption",
  "expert_late_to_join",
  "learner_late_to_join",
  "expert_did_not_join_session",
  "learner_did_not_join_session",
]);

const bodySchema = z
  .object({
    bookingId: z.string().uuid(),
    feedback_type: feedbackTypes,
    feedback_text: z.string().min(1).max(8000),
  })
  .strict();

export async function POST(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { bookingId, feedback_type, feedback_text } = parsed.data;
  const admin = createAdminClient();

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("booking_id, learner_user_id, expert_user_id")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (bErr) {
    return Response.json({ error: publicApiError(bErr) }, { status: 500 });
  }
  if (!booking) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.learner_user_id !== userId && booking.expert_user_id !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const insertBody: Record<string, unknown> = {
    user_id: userId,
    feedback_type,
    feedback_text: feedback_text.trim(),
    booking_id: bookingId,
    context: {
      source: "session_issue",
    },
    admin_review_status: "pending",
  };

  let { error: insErr } = await admin.from("user_feedback").insert(insertBody);

  if (insErr) {
    const msg = insErr.message?.toLowerCase() ?? "";
    // Fall back silently if migration 028 hasn't been applied yet.
    if (msg.includes("admin_review_status") || msg.includes("schema cache")) {
      delete insertBody.admin_review_status;
      ({ error: insErr } = await admin.from("user_feedback").insert(insertBody));
    }
  }

  if (insErr) {
    return Response.json({ error: publicApiError(insErr) }, { status: 500 });
  }

  return Response.json({ ok: true });
}

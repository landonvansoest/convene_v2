import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { dispatchBookingComplaintAlert } from "@/lib/notifications/admin-alerts";

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

  let first = await admin.from("user_feedback").insert(insertBody).select("feedback_id").single();
  if (first.error) {
    const msg = first.error.message?.toLowerCase() ?? "";
    if (msg.includes("admin_review_status") || msg.includes("schema cache")) {
      delete insertBody.admin_review_status;
      first = await admin.from("user_feedback").insert(insertBody).select("feedback_id").single();
    }
  }

  if (first.error) {
    return Response.json({ error: publicApiError(first.error) }, { status: 500 });
  }

  const feedbackId = first.data?.feedback_id ? String(first.data.feedback_id) : null;
  if (feedbackId) {
    try {
      await dispatchBookingComplaintAlert({
        feedbackId,
        bookingId,
        feedbackType: feedback_type,
        feedbackText: feedback_text.trim(),
      });
    } catch {
      /* best-effort */
    }
  }

  return Response.json({ ok: true });
}

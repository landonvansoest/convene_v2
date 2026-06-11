import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import {
  resolveUserFeedback,
  sendAdminBookingDm,
} from "@/lib/admin/booking-problem-actions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ bookingId: string }> };

const bodySchema = z.object({
  status: z.enum(["resolved"]),
  /** Optional DM to the learner explaining the resolution. */
  message: z.string().trim().min(1).max(4000).optional().nullable(),
  /** If this action resolves a user_feedback complaint, pass its feedback_id. */
  feedbackId: z.string().uuid().optional().nullable(),
  /** Source of the queue item ("no_show" or "complaint"). Default no_show. */
  source: z.enum(["no_show", "complaint"]).optional(),
});

/**
 * Mark a booking-problem queue item resolved without (or after) a Stripe refund.
 * Handles both the expert no-show queue and the user-complaint queue.
 */
export async function PATCH(request: Request, { params }: Params) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const { bookingId } = await params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const { message, feedbackId, source = "no_show" } = parsed.data;
  const admin = createAdminClient();

  const { data: booking, error: bookErr } = await admin
    .from("bookings")
    .select("booking_id, status, refund_review_status, learner_user_id")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (bookErr) return Response.json({ error: publicApiError(bookErr) }, { status: 500 });
  if (!booking) return Response.json({ error: "Booking not found" }, { status: 404 });

  // Only flip the booking's refund_review_status for no-show queue items —
  // complaints don't own that flag.
  if (source === "no_show") {
    if (booking.status !== "no_show_expert") {
      return Response.json(
        { error: "Booking not found or not an expert no-show" },
        { status: 404 },
      );
    }
    const { error: upErr } = await admin
      .from("bookings")
      .update({
        refund_review_status: "resolved",
        updated_at: new Date().toISOString(),
      })
      .eq("booking_id", bookingId);
    if (upErr) return Response.json({ error: publicApiError(upErr) }, { status: 500 });
  }

  let dmResult: Awaited<ReturnType<typeof sendAdminBookingDm>> | null = null;
  if (message && booking.learner_user_id) {
    dmResult = await sendAdminBookingDm({
      recipientUserId: booking.learner_user_id as string,
      message,
      bookingId,
      feedbackId: feedbackId ?? undefined,
      kind: "dismiss",
    });
  }

  let feedbackResolved = false;
  if (feedbackId) {
    const r = await resolveUserFeedback(feedbackId, message ?? undefined);
    feedbackResolved = r.resolved;
  }

  return Response.json({
    ok: true,
    messageSent: dmResult?.sent ?? false,
    messageError: dmResult && !dmResult.sent ? dmResult.reason : null,
    feedbackResolved,
  });
}

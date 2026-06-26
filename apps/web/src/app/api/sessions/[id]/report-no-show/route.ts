import { createAdminClient } from "@/lib/supabase/admin";
import { displayName, getAuthedUserId, getUsersByIds } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { persistBookingDependability } from "@/lib/dependability-persist";
import { dispatchBookingNoShowAlert } from "@/lib/notifications/admin-alerts";
import { resolveWaitingRoomNoShowReport } from "@/lib/resolveWaitingRoomNoShowReport";
import { isTerminalSessionStatus } from "@/lib/resolveManualSessionEndStatus";
import {
  processExpertNoShowLearnerRefund,
  processLearnerNoShowExpertPayout,
} from "@/lib/stripe/session-no-show-settlement";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function refundReviewStatusForReport(
  status: string,
  prevRefund: string | null | undefined,
): "none" | "pending" | "resolved" {
  if (status !== "no_show_expert") return "none";
  if (prevRefund === "resolved") return "resolved";
  return "pending";
}

/** Waiting-room no-show report (10+ min after start; reporter joined, partner has not). */
export async function POST(_request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: bookingId } = await params;
  const admin = createAdminClient();
  const { data: b, error } = await admin
    .from("bookings")
    .select(
      "booking_id, learner_user_id, expert_user_id, learner_joined, expert_joined, status, session_date, start_time, end_time, duration, booking_amount, total_amount, stripe_payment_intent_id, refunded_amount_cents, refund_review_status, cancelled_at",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (error) return Response.json({ error: publicApiError(error) }, { status: 500 });
  if (!b) return Response.json({ error: "Booking not found" }, { status: 404 });
  if (b.learner_user_id !== userId && b.expert_user_id !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentStatus = String(b.status ?? "").toLowerCase();
  if (isTerminalSessionStatus(currentStatus)) {
    return Response.json({
      ok: true,
      alreadyFinalized: true,
      status: currentStatus,
      booking: b,
    });
  }

  const resolved = resolveWaitingRoomNoShowReport(
    {
      session_date: String(b.session_date ?? ""),
      start_time: String(b.start_time ?? ""),
      learner_joined: b.learner_joined as string | null,
      expert_joined: b.expert_joined as string | null,
      status: b.status as string | null,
      cancelled_at: b.cancelled_at as string | null,
    },
    userId,
    b.learner_user_id as string,
    b.expert_user_id as string,
  );

  if ("error" in resolved) {
    return Response.json({ error: resolved.error }, { status: 400 });
  }

  const status = resolved.status;
  let refund_review_status = refundReviewStatusForReport(
    status,
    b.refund_review_status as string | null,
  );

  const { data: updated, error: upErr } = await admin
    .from("bookings")
    .update({
      status,
      refund_review_status,
      updated_at: new Date().toISOString(),
    })
    .eq("booking_id", bookingId)
    .select("*")
    .maybeSingle();

  if (upErr) return Response.json({ error: publicApiError(upErr) }, { status: 500 });
  if (!updated) return Response.json({ error: "Booking not found" }, { status: 404 });

  try {
    await persistBookingDependability(admin, bookingId);
  } catch {
    /* non-fatal */
  }

  const bookingRow = {
    booking_id: bookingId,
    session_date: String(b.session_date ?? ""),
    start_time: String(b.start_time ?? ""),
    end_time: b.end_time,
    duration: b.duration,
    booking_amount: b.booking_amount,
    total_amount: b.total_amount,
    stripe_payment_intent_id: b.stripe_payment_intent_id as string | null,
    refunded_amount_cents: b.refunded_amount_cents as number | null,
    expert_user_id: b.expert_user_id as string,
    learner_user_id: b.learner_user_id as string,
  };

  let settlementNote: string | null = null;

  if (status === "no_show_expert") {
    const refundResult = await processExpertNoShowLearnerRefund(admin, bookingRow);
    if (refundResult.ok && refundResult.refundedCents > 0) {
      refund_review_status = "resolved";
      await admin
        .from("bookings")
        .update({ refund_review_status: "resolved", updated_at: new Date().toISOString() })
        .eq("booking_id", bookingId);
      settlementNote = "A full refund has been issued to your payment method.";
    } else if (refundResult.ok) {
      settlementNote = "Your no-show report was recorded. Our team will process your refund shortly.";
      try {
        const users = await getUsersByIds([b.learner_user_id, b.expert_user_id]);
        const learner = users.find((u) => u.user_id === b.learner_user_id);
        const expert = users.find((u) => u.user_id === b.expert_user_id);
        await dispatchBookingNoShowAlert({
          bookingId,
          sessionDate: String(b.session_date),
          startTime: String(b.start_time),
          learnerName: learner ? displayName(learner) : null,
          expertName: expert ? displayName(expert) : null,
        });
      } catch {
        /* best-effort */
      }
    } else {
      settlementNote =
        "Your no-show report was recorded. Refund processing encountered an issue — support will follow up.";
      refund_review_status = "pending";
      await admin
        .from("bookings")
        .update({ refund_review_status: "pending", updated_at: new Date().toISOString() })
        .eq("booking_id", bookingId);
    }
  }

  if (status === "no_show_learner") {
    const payoutResult = await processLearnerNoShowExpertPayout(admin, bookingRow);
    if (payoutResult.ok) {
      settlementNote = "You will receive 50% of the booking fee for this session.";
    } else {
      settlementNote =
        "Your no-show report was recorded. Payout processing encountered an issue — support will follow up.";
    }
  }

  const { data: finalBooking } = await admin
    .from("bookings")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();

  return Response.json({
    ok: true,
    status,
    settlementNote,
    booking: finalBooking ?? updated,
  });
}

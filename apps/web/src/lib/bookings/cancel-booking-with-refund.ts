import type { SupabaseClient } from "@supabase/supabase-js";
import { persistBookingDependability } from "@/lib/dependability-persist";
import { dispatchBookingCanceled } from "@/lib/notifications/booking-notifications";
import { getStripe } from "@/lib/stripe/server";

/**
 * Cancel an upcoming booking and refund the learner when a Stripe payment exists.
 * Used when a reschedule proposal is declined — the original session does not continue.
 */
export async function cancelBookingWithLearnerRefund(
  admin: SupabaseClient,
  bookingId: string,
  cancelledByUserId: string,
): Promise<{ ok: true; refundedCents: number } | { ok: false; error: string }> {
  const { data: booking, error: fetchErr } = await admin
    .from("bookings")
    .select(
      "booking_id, status, payment_status, stripe_payment_intent_id, refunded_amount_cents, learner_user_id, expert_user_id",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!booking) return { ok: false, error: "Booking not found" };

  const st = String(booking.status ?? "").toLowerCase();
  if (st === "cancelled") {
    return { ok: true, refundedCents: Number(booking.refunded_amount_cents ?? 0) };
  }

  const nowIso = new Date().toISOString();
  let refundedCents = 0;
  const ps = String(booking.payment_status ?? "").toLowerCase();
  const piId = booking.stripe_payment_intent_id?.trim();
  const paid = ps === "paid" || ps === "succeeded";

  if (paid && piId) {
    const stripe = getStripe();
    if (!stripe) {
      return { ok: false, error: "Stripe is not configured" };
    }
    try {
      const prev = Number(booking.refunded_amount_cents ?? 0);
      const refund = await stripe.refunds.create({ payment_intent: piId });
      refundedCents = typeof refund.amount === "number" ? refund.amount : 0;
      const { error: refundUpErr } = await admin
        .from("bookings")
        .update({
          refunded_amount_cents: prev + refundedCents,
          updated_at: nowIso,
        })
        .eq("booking_id", bookingId);
      if (refundUpErr) {
        return { ok: false, error: refundUpErr.message };
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Refund failed" };
    }
  }

  const { error: upErr } = await admin
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: nowIso,
      cancelled_by: cancelledByUserId,
      pending_reschedule_date: null,
      pending_reschedule_start_time: null,
      pending_reschedule_end_time: null,
      updated_at: nowIso,
    })
    .eq("booking_id", bookingId);

  if (upErr) return { ok: false, error: upErr.message };

  try {
    await persistBookingDependability(admin, bookingId);
  } catch {
    // Non-fatal — score can be backfilled later.
  }

  const refundStatus =
    refundedCents > 0
      ? `A refund of $${(refundedCents / 100).toFixed(2)} has been issued to the original payment method.`
      : paid && piId
        ? "A refund is being processed for this cancellation."
        : "No payment was charged for this session.";

  try {
    await dispatchBookingCanceled(bookingId, refundStatus);
  } catch (e) {
    console.error("[cancel-booking-with-refund] cancel notification failed", e);
  }

  return { ok: true, refundedCents };
}

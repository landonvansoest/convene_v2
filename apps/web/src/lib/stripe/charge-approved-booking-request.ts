import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { isAwaitingExpertBookingRequest } from "@/lib/booking-request";
import { isSessionPaymentTestBypassAllowed } from "@/lib/dev-session-payment-test";
import { dispatchBookingConfirmed } from "@/lib/notifications/booking-notifications";
import { finalizeSessionBookingFromPaymentIntent } from "@/lib/stripe/finalize-session-payment";
import { ensureLearnerStripeCustomer } from "@/lib/stripe/ensure-learner-customer";
import { getStripe } from "@/lib/stripe/server";

function bookingTotalToCents(totalAmount: unknown): number {
  if (totalAmount == null) return -1;
  const s = String(totalAmount).trim();
  const m = /^(-?)(\d+)\.(\d{2})$/.exec(s);
  if (m) {
    const sign = m[1] ? -1 : 1;
    return sign * (parseInt(m[2], 10) * 100 + parseInt(m[3], 10));
  }
  const n = Number(totalAmount);
  if (!Number.isFinite(n) || n <= 0) return -1;
  return Math.round(n * 100 + Number.EPSILON);
}

export type ChargeApprovedBookingRequestResult =
  | { ok: true; charged: true; paymentIntentId: string }
  | { ok: true; charged: false; reason: "requires_action" | "payment_failed" }
  | { ok: false; error: string };

async function markBookingPaidDevBypass(
  admin: SupabaseClient,
  bookingId: string,
): Promise<ChargeApprovedBookingRequestResult> {
  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from("bookings")
    .update({ payment_status: "paid", updated_at: now })
    .eq("booking_id", bookingId);
  if (updErr) {
    return { ok: false, error: updErr.message };
  }

  const { data: booking } = await admin
    .from("bookings")
    .select(
      "booking_id, expert_user_id, learner_user_id, booking_amount, extensions_amount, taxes_fees, discount_applied, total_amount",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!booking) {
    return { ok: false, error: "Booking not found after dev bypass" };
  }

  const amountCents = bookingTotalToCents(booking.total_amount);
  const feeCents = Math.round(amountCents * 0.1);
  const { error: txErr } = await admin.from("transactions").insert({
    transaction_type: "session_booking",
    booking_id: booking.booking_id,
    expert_user_id: booking.expert_user_id,
    learner_user_id: booking.learner_user_id,
    booking_amount: Number(booking.booking_amount),
    extensions_amount: Number(booking.extensions_amount ?? 0),
    platform_fee: feeCents / 100,
    taxes_fees: Number(booking.taxes_fees ?? 0),
    total_charge: amountCents / 100,
    expert_earnings: Math.max(0, (amountCents - feeCents) / 100),
    status: "succeeded",
    payment_method: "dev_skip",
    transaction_date: now,
    updated_at: now,
  });
  if (txErr) {
    return { ok: false, error: txErr.message };
  }

  try {
    await dispatchBookingConfirmed(bookingId);
  } catch (e) {
    console.error("[charge-booking-request] dev bypass notification failed", e);
  }

  return { ok: true, charged: true, paymentIntentId: "dev_skip" };
}

/**
 * Off-session charge when an expert approves a booking request with a saved payment method.
 */
export async function chargeApprovedBookingRequest(
  admin: SupabaseClient,
  bookingId: string,
): Promise<ChargeApprovedBookingRequestResult> {
  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select(
      "booking_id, expert_user_id, learner_user_id, payment_status, total_amount, stripe_payment_method_id",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (loadErr) {
    return { ok: false, error: loadErr.message };
  }
  if (!booking) {
    return { ok: false, error: "Booking not found" };
  }
  if (!isAwaitingExpertBookingRequest(booking.payment_status)) {
    return { ok: false, error: "Booking is not awaiting expert approval" };
  }

  const paymentMethodId = String(booking.stripe_payment_method_id ?? "").trim();
  if (!paymentMethodId) {
    return { ok: false, error: "No saved payment method on this booking request" };
  }

  const ps = String(booking.payment_status ?? "").toLowerCase();
  if (ps === "paid" || ps === "succeeded") {
    return { ok: true, charged: true, paymentIntentId: "" };
  }

  const amount = bookingTotalToCents(booking.total_amount);
  if (amount < 1) {
    return { ok: false, error: "Invalid booking total amount" };
  }

  const { data: expertProfile } = await admin
    .from("expert_profiles")
    .select("stripe_connect_account_id")
    .eq("user_id", booking.expert_user_id)
    .maybeSingle();

  const destination = expertProfile?.stripe_connect_account_id?.trim() || null;
  const allowBypass = await isSessionPaymentTestBypassAllowed(admin);

  if (!destination && allowBypass) {
    return markBookingPaidDevBypass(admin, bookingId);
  }
  if (!destination) {
    return { ok: false, error: "Expert payment setup not complete" };
  }

  const stripe = getStripe();
  if (!stripe) {
    if (allowBypass) {
      return markBookingPaidDevBypass(admin, bookingId);
    }
    return { ok: false, error: "Stripe is not configured" };
  }

  const customerResult = await ensureLearnerStripeCustomer(
    stripe,
    admin,
    String(booking.learner_user_id),
  );
  if (!customerResult.ok) {
    return { ok: false, error: customerResult.error };
  }

  const applicationFeeAmount = Math.round(amount * 0.1);

  try {
    const pi = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      customer: customerResult.customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      application_fee_amount: applicationFeeAmount,
      transfer_data: { destination },
      metadata: {
        bookingId,
        expertUserId: String(booking.expert_user_id),
        conveneBookingRequestCharge: "1",
      },
    });

    await admin
      .from("bookings")
      .update({
        stripe_payment_intent_id: pi.id,
        updated_at: new Date().toISOString(),
      })
      .eq("booking_id", bookingId);

    if (pi.status === "succeeded") {
      await finalizeSessionBookingFromPaymentIntent(admin, pi, { stripe });
      return { ok: true, charged: true, paymentIntentId: pi.id };
    }

    if (pi.status === "requires_action") {
      return { ok: true, charged: false, reason: "requires_action" };
    }

    return { ok: true, charged: false, reason: "payment_failed" };
  } catch (err: unknown) {
    const stripeErr = err as Stripe.errors.StripeError | undefined;
    const code = stripeErr?.code ?? "";
    if (
      code === "authentication_required" ||
      code === "card_declined" ||
      stripeErr?.type === "StripeCardError"
    ) {
      return { ok: true, charged: false, reason: "requires_action" };
    }
    const message = stripeErr?.message ?? (err instanceof Error ? err.message : "Charge failed");
    return { ok: false, error: message };
  }
}

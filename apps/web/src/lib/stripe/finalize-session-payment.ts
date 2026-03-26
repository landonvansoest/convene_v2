import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

/**
 * On successful PaymentIntent: mark booking paid and write ledger row (Bible-shaped).
 * Idempotent: one succeeded `session_booking` transaction per booking.
 */
export async function finalizeSessionBookingFromPaymentIntent(
  admin: SupabaseClient,
  pi: Stripe.PaymentIntent
): Promise<void> {
  const bookingId = (pi.metadata?.bookingId ?? "").trim();
  if (!bookingId) {
    console.info(
      "[stripe] payment_intent.succeeded: no bookingId in metadata; skip DB finalize"
    );
    return;
  }

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select(
      "booking_id, expert_user_id, learner_user_id, booking_amount, extensions_amount, taxes_fees, platform_fee, total_amount, discount_applied"
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (bookingErr || !booking) {
    console.error(
      "[stripe] booking not found for PI",
      pi.id,
      bookingId,
      bookingErr?.message
    );
    return;
  }

  const metaExpert = (pi.metadata?.expertUserId ?? "").trim();
  if (metaExpert && metaExpert !== booking.expert_user_id) {
    console.warn(
      "[stripe] expertUserId metadata does not match booking.expert_user_id",
      { metaExpert, bookingExpert: booking.expert_user_id }
    );
  }

  const { data: existing } = await admin
    .from("transactions")
    .select("transaction_id")
    .eq("booking_id", bookingId)
    .eq("transaction_type", "session_booking")
    .eq("status", "succeeded")
    .maybeSingle();

  if (existing) {
    console.info("[stripe] idempotent skip: session_booking already recorded", bookingId);
    return;
  }

  const amountCents = pi.amount_received ?? pi.amount;
  const feeCents =
    pi.application_fee_amount ?? Math.round(amountCents * 0.1);
  const totalCharge = amountCents / 100;
  const platformFee = feeCents / 100;
  const expertEarnings = Math.max(0, (amountCents - feeCents) / 100);

  const now = new Date().toISOString();

  const { error: bookUpdateErr } = await admin
    .from("bookings")
    .update({ payment_status: "paid", updated_at: now })
    .eq("booking_id", bookingId);

  if (bookUpdateErr) {
    console.error("[stripe] failed to update booking payment_status", bookUpdateErr.message);
    return;
  }

  const { error: txErr } = await admin.from("transactions").insert({
    transaction_type: "session_booking",
    booking_id: bookingId,
    expert_user_id: booking.expert_user_id,
    learner_user_id: booking.learner_user_id,
    booking_amount: Number(booking.booking_amount),
    extensions_amount: Number(booking.extensions_amount ?? 0),
    platform_fee: platformFee,
    taxes_fees: Number(booking.taxes_fees ?? 0),
    total_charge: totalCharge,
    expert_earnings: expertEarnings,
    status: "succeeded",
    payment_method: "stripe",
    transaction_date: now,
    updated_at: now,
  });

  if (txErr) {
    console.error("[stripe] failed to insert transaction", txErr.message);
    return;
  }

  const disc = Number(booking.discount_applied ?? 0);
  if (disc > 0) {
    const { data: av } = await admin
      .from("expert_availability")
      .select("first_session_discount_type")
      .eq("user_id", booking.expert_user_id)
      .maybeSingle();
    const dtype = (av?.first_session_discount_type ?? null) as "percent" | "fixed_amount" | null;

    const { error: redErr } = await admin.from("discount_redemptions").insert({
      expert_user_id: booking.expert_user_id,
      learner_user_id: booking.learner_user_id,
      booking_id: bookingId,
      discount_type: dtype,
      discount_value_applied: disc,
      status: "consumed",
      used_at: now,
      payment_intent_id: pi.id,
    });

    if (redErr) {
      console.error("[stripe] discount_redemptions insert failed", redErr.message);
    }
  }
}

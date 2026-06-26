import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { expertHasBlockingBookingOverlap } from "@/lib/session-booking-prepare";
import { dispatchBookingConfirmed } from "@/lib/notifications/booking-notifications";

/**
 * On successful PaymentIntent: mark booking paid and write ledger row (Bible-shaped).
 * Idempotent: one succeeded `session_booking` transaction per booking.
 *
 * Deferred checkout (`conveneSessionCheckout` metadata): inserts booking only after payment succeeds.
 */
export async function finalizeSessionBookingFromPaymentIntent(
  admin: SupabaseClient,
  pi: Stripe.PaymentIntent,
  options?: { stripe?: Stripe | null },
): Promise<void> {
  if ((pi.metadata?.conveneSessionExtension ?? "").trim() === "1") {
    return;
  }
  const stripe = options?.stripe ?? null;
  const deferred = (pi.metadata?.conveneSessionCheckout ?? "").trim() === "1";

  if (deferred) {
    await finalizeDeferredSessionCheckout(admin, pi, stripe);
    return;
  }

  await finalizeExistingBookingFromPaymentIntent(admin, pi);
}

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

async function insertSessionBookingTransaction(
  admin: SupabaseClient,
  pi: Stripe.PaymentIntent,
  booking: {
    booking_id: string;
    expert_user_id: string;
    learner_user_id: string;
    booking_amount: unknown;
    extensions_amount?: unknown;
    taxes_fees?: unknown;
    discount_applied?: unknown;
  },
): Promise<boolean> {
  const amountCents = pi.amount_received ?? pi.amount;
  const feeCents = pi.application_fee_amount ?? Math.round(amountCents * 0.1);
  const totalCharge = amountCents / 100;
  const platformFee = feeCents / 100;
  const expertEarnings = Math.max(0, (amountCents - feeCents) / 100);
  const now = new Date().toISOString();

  const { error: txErr } = await admin.from("transactions").insert({
    transaction_type: "session_booking",
    booking_id: booking.booking_id,
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
    return false;
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
      booking_id: booking.booking_id,
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

  return true;
}

async function finalizeDeferredSessionCheckout(
  admin: SupabaseClient,
  pi: Stripe.PaymentIntent,
  stripe: Stripe | null,
): Promise<void> {
  const m = pi.metadata ?? {};
  const learnerUserId = String(m.learnerUserId ?? "").trim();
  const expertUserId = String(m.expertUserId ?? "").trim();
  const expertProfileId = String(m.expertProfileId ?? "").trim();
  const sessionDate = String(m.sessionDate ?? "").trim();
  const startTime = String(m.startTime ?? "").trim();
  const endTime = String(m.endTime ?? "").trim();
  const durationMinutes = Number(m.durationMinutes ?? NaN);

  if (!learnerUserId || !expertUserId || !expertProfileId || !sessionDate || !startTime || !endTime) {
    console.error("[stripe] deferred checkout: missing metadata fields", pi.id);
    return;
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    console.error("[stripe] deferred checkout: invalid durationMinutes", pi.id);
    return;
  }

  const expectedCents = bookingTotalToCents(m.totalAmount);
  const received = pi.amount_received ?? pi.amount;
  if (expectedCents < 1 || received !== expectedCents) {
    console.error("[stripe] deferred checkout: amount mismatch", {
      pi: pi.id,
      expectedCents,
      received,
    });
    return;
  }

  const { data: existingByPi } = await admin
    .from("bookings")
    .select(
      "booking_id, expert_user_id, learner_user_id, booking_amount, extensions_amount, taxes_fees, discount_applied",
    )
    .eq("stripe_payment_intent_id", pi.id)
    .maybeSingle();

  if (existingByPi) {
    const { data: existingTx } = await admin
      .from("transactions")
      .select("transaction_id")
      .eq("booking_id", existingByPi.booking_id)
      .eq("transaction_type", "session_booking")
      .eq("status", "succeeded")
      .maybeSingle();

    if (existingTx) {
      console.info("[stripe] idempotent skip: deferred session already recorded", pi.id);
      try {
        await dispatchBookingConfirmed(existingByPi.booking_id as string);
      } catch (e) {
        console.error("[stripe] booking confirmed notification failed (idempotent retry)", e);
      }
      return;
    }
    await insertSessionBookingTransaction(admin, pi, existingByPi);
    try {
      await dispatchBookingConfirmed(existingByPi.booking_id as string);
    } catch (e) {
      console.error("[stripe] booking confirmed notification failed", e);
    }
    return;
  }

  const overlap = await expertHasBlockingBookingOverlap(admin, expertUserId, sessionDate, startTime, endTime);
  if (overlap) {
    console.error("[stripe] deferred checkout: slot conflict after payment; attempting refund", pi.id);
    if (stripe) {
      try {
        await stripe.refunds.create({ payment_intent: pi.id });
      } catch (e) {
        console.error("[stripe] deferred checkout refund failed", e);
      }
    }
    return;
  }

  const rate = Number(m.rate ?? NaN);
  const discountApplied = Number(m.discountApplied ?? 0);
  const bookingAmount = Number(m.bookingAmount ?? NaN);
  const platformFee = Number(m.platformFee ?? NaN);
  const taxesFees = Number(m.taxesFees ?? NaN);
  const totalAmount = Number(m.totalAmount ?? NaN);
  if (
    ![rate, bookingAmount, platformFee, taxesFees, totalAmount].every(
      (n) => Number.isFinite(n) && n >= 0,
    )
  ) {
    console.error("[stripe] deferred checkout: invalid numeric metadata", pi.id);
    return;
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insErr } = await admin
    .from("bookings")
    .insert({
      expert_user_id: expertUserId,
      learner_user_id: learnerUserId,
      expert_profile_id: expertProfileId,
      session_date: sessionDate,
      start_time: startTime,
      end_time: endTime,
      duration: `${durationMinutes} minutes`,
      rate,
      discount_applied: discountApplied,
      booking_amount: bookingAmount,
      platform_fee: platformFee,
      taxes_fees: taxesFees,
      total_amount: totalAmount,
      status: "upcoming",
      payment_status: "paid",
      stripe_payment_intent_id: pi.id,
      created_at: now,
      updated_at: now,
    })
    .select(
      "booking_id, expert_user_id, learner_user_id, booking_amount, extensions_amount, taxes_fees, discount_applied",
    )
    .single();

  if (insErr || !inserted) {
    console.error("[stripe] deferred checkout: booking insert failed", insErr?.message);
    if (stripe) {
      try {
        await stripe.refunds.create({ payment_intent: pi.id });
      } catch (e) {
        console.error("[stripe] deferred checkout refund after insert failure failed", e);
      }
    }
    return;
  }

  await insertSessionBookingTransaction(admin, pi, inserted);
  try {
    await dispatchBookingConfirmed(inserted.booking_id as string);
  } catch (e) {
    console.error("[stripe] booking confirmed notification failed", e);
  }
}

async function finalizeExistingBookingFromPaymentIntent(
  admin: SupabaseClient,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  const bookingId = (pi.metadata?.bookingId ?? "").trim();
  if (!bookingId) {
    console.info(
      "[stripe] payment_intent.succeeded: no bookingId in metadata; skip DB finalize",
    );
    return;
  }

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select(
      "booking_id, expert_user_id, learner_user_id, booking_amount, extensions_amount, taxes_fees, platform_fee, total_amount, discount_applied",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (bookingErr || !booking) {
    console.error(
      "[stripe] booking not found for PI",
      pi.id,
      bookingId,
      bookingErr?.message,
    );
    return;
  }

  const metaExpert = (pi.metadata?.expertUserId ?? "").trim();
  if (metaExpert && metaExpert !== booking.expert_user_id) {
    console.warn(
      "[stripe] expertUserId metadata does not match booking.expert_user_id",
      { metaExpert, bookingExpert: booking.expert_user_id },
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
    try {
      await dispatchBookingConfirmed(bookingId);
    } catch (e) {
      console.error("[stripe] booking confirmed notification failed (idempotent retry)", e);
    }
    return;
  }

  const now = new Date().toISOString();

  const { error: bookUpdateErr } = await admin
    .from("bookings")
    .update({ payment_status: "paid", updated_at: now })
    .eq("booking_id", bookingId);

  if (bookUpdateErr) {
    console.error("[stripe] failed to update booking payment_status", bookUpdateErr.message);
    return;
  }

  await insertSessionBookingTransaction(admin, pi, booking);
  try {
    await dispatchBookingConfirmed(bookingId);
  } catch (e) {
    console.error("[stripe] booking confirmed notification failed", e);
  }
}

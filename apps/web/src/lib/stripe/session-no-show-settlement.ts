import type { SupabaseClient } from "@supabase/supabase-js";
import { displayName, getUsersByIds } from "@/lib/messages/service";
import {
  dispatchExpertNoShowRefund,
} from "@/lib/notifications/booking-notifications";
import { getStripe } from "@/lib/stripe/server";

type BookingRow = {
  booking_id: string;
  session_date: string;
  start_time: string;
  end_time?: string | null;
  duration?: unknown;
  booking_amount: unknown;
  total_amount: unknown;
  stripe_payment_intent_id: string | null;
  refunded_amount_cents: number | null;
  expert_user_id: string;
  learner_user_id: string;
};

function bookingScheduleFields(b: BookingRow) {
  return {
    booking_id: b.booking_id,
    session_date: String(b.session_date ?? ""),
    start_time: String(b.start_time ?? ""),
    end_time: b.end_time,
    duration: b.duration,
    booking_amount: b.booking_amount,
    total_amount: b.total_amount,
  };
}

/** Learner-reported expert no-show: full Stripe refund when possible + learner notification. */
export async function processExpertNoShowLearnerRefund(
  admin: SupabaseClient,
  booking: BookingRow,
): Promise<{ ok: boolean; refundedCents: number; error?: string }> {
  const stripe = getStripe();
  const piId = booking.stripe_payment_intent_id?.trim();
  if (!piId || !stripe) {
    return { ok: true, refundedCents: 0 };
  }

  try {
    const prev = Number(booking.refunded_amount_cents ?? 0);
    const refund = await stripe.refunds.create({ payment_intent: piId });
    const delta = typeof refund.amount === "number" ? refund.amount : 0;

    await admin
      .from("bookings")
      .update({
        refunded_amount_cents: prev + delta,
        refund_review_status: "resolved",
        updated_at: new Date().toISOString(),
      })
      .eq("booking_id", booking.booking_id);

    const users = await getUsersByIds([booking.learner_user_id, booking.expert_user_id]);
    const learner = users.find((u) => u.user_id === booking.learner_user_id);
    const expert = users.find((u) => u.user_id === booking.expert_user_id);
    if (learner?.email_address && delta > 0) {
      try {
        await dispatchExpertNoShowRefund({
          recipientEmail: learner.email_address,
          recipientName: displayName(learner),
          booking: bookingScheduleFields(booking),
          expertName: expert ? displayName(expert) : "your expert",
          refundAmount: `$${(delta / 100).toFixed(2)}`,
        });
      } catch {
        /* best-effort */
      }
    }

    return { ok: true, refundedCents: delta };
  } catch (e) {
    return {
      ok: false,
      refundedCents: 0,
      error: e instanceof Error ? e.message : "Refund failed",
    };
  }
}

/**
 * Expert-reported learner no-show: expert keeps 50% of booking_amount.
 * On Connect destination charges, reverse any transfer above that entitlement.
 */
export async function processLearnerNoShowExpertPayout(
  admin: SupabaseClient,
  booking: BookingRow,
): Promise<{ ok: boolean; expertPayoutCents: number; error?: string }> {
  const bookingAmountCents = Math.max(0, Math.round(Number(booking.booking_amount) * 100));
  const expertEntitledCents = Math.floor(bookingAmountCents / 2);

  const stripe = getStripe();
  const piId = booking.stripe_payment_intent_id?.trim();

  if (!stripe || !piId || expertEntitledCents <= 0) {
    await admin
      .from("bookings")
      .update({
        learner_no_show_payout_status: expertEntitledCents > 0 ? "pending" : "none",
        learner_no_show_expert_payout_cents: expertEntitledCents || null,
        updated_at: new Date().toISOString(),
      })
      .eq("booking_id", booking.booking_id);
    return { ok: true, expertPayoutCents: expertEntitledCents };
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
    const chargeRaw = pi.latest_charge;
    const chargeId = typeof chargeRaw === "string" ? chargeRaw : chargeRaw?.id;
    if (!chargeId) {
      throw new Error("No charge found for this booking.");
    }

    const charge = await stripe.charges.retrieve(chargeId);
    const transferId =
      typeof charge.transfer === "string"
        ? charge.transfer
        : charge.transfer && typeof charge.transfer === "object" && "id" in charge.transfer
          ? String((charge.transfer as { id: string }).id)
          : null;

    let reversedCents = 0;
    if (transferId) {
      const transfer = await stripe.transfers.retrieve(transferId);
      const transferredCents = transfer.amount;
      reversedCents = Math.max(0, transferredCents - expertEntitledCents);
      if (reversedCents > 0) {
        await stripe.transfers.createReversal(transferId, { amount: reversedCents });
      }
    }

    const now = new Date().toISOString();
    const expertEarnings = expertEntitledCents / 100;
    const platformFee = Math.max(0, Number(booking.booking_amount) - expertEarnings);

    await admin.from("transactions").insert({
      transaction_type: "adjustment",
      booking_id: booking.booking_id,
      expert_user_id: booking.expert_user_id,
      learner_user_id: booking.learner_user_id,
      booking_amount: Number(booking.booking_amount),
      platform_fee: platformFee,
      total_charge: Number(booking.total_amount ?? booking.booking_amount),
      expert_earnings: expertEarnings,
      status: "succeeded",
      payment_method: "stripe",
      transaction_date: now,
      updated_at: now,
    });

    await admin
      .from("bookings")
      .update({
        learner_no_show_payout_status: "paid",
        learner_no_show_expert_payout_cents: expertEntitledCents,
        updated_at: now,
      })
      .eq("booking_id", booking.booking_id);

    return { ok: true, expertPayoutCents: expertEntitledCents };
  } catch (e) {
    await admin
      .from("bookings")
      .update({
        learner_no_show_payout_status: "failed",
        learner_no_show_expert_payout_cents: expertEntitledCents,
        updated_at: new Date().toISOString(),
      })
      .eq("booking_id", booking.booking_id);
    return {
      ok: false,
      expertPayoutCents: expertEntitledCents,
      error: e instanceof Error ? e.message : "Expert payout adjustment failed",
    };
  }
}

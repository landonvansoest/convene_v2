import type { SupabaseClient } from "@supabase/supabase-js";
import { getDevToolEnabled } from "@/lib/devTools/store";
import {
  expertHasBlockingBookingOverlap,
  prepareExpertSessionBooking,
} from "@/lib/session-booking-prepare";

/**
 * Whether session/freelance/extension payments may proceed without an expert
 * Stripe Connect account (platform collects; no transfer_data).
 *
 * Allowed when:
 * - local dev (`NODE_ENV !== production`)
 * - Vercel Preview (`VERCEL_ENV=preview`) — testing only; remove before launch
 * - `ALLOW_PAYMENT_BYPASS=true` env
 * - Admin DEV Tools toggle `payment_bypass_session`
 */
export async function isSessionPaymentTestBypassAllowed(admin: SupabaseClient): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.VERCEL_ENV === "preview") return true;
  if (process.env.ALLOW_PAYMENT_BYPASS === "true") return true;
  return await getDevToolEnabled(admin, "payment_bypass_session");
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

async function insertSessionBookingLedgerForTest(
  admin: SupabaseClient,
  booking: {
    booking_id: string;
    expert_user_id: string;
    learner_user_id: string;
    booking_amount: unknown;
    extensions_amount?: unknown;
    taxes_fees?: unknown;
    discount_applied?: unknown;
  },
  totalAmountUsd: unknown,
): Promise<boolean> {
  const amountCents = bookingTotalToCents(totalAmountUsd);
  if (amountCents < 0) return false;
  const feeCents = Math.round(amountCents * 0.1);
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
    payment_method: "dev_skip",
    transaction_date: now,
    updated_at: now,
  });

  if (txErr) {
    console.error("[dev-session-payment-test] transaction insert failed", txErr.message);
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
      payment_intent_id: null,
    });

    if (redErr) {
      console.error("[dev-session-payment-test] discount_redemptions insert failed", redErr.message);
    }
  }

  return true;
}

/** Idempotent: paid + ledger if missing. */
export async function completeLegacyBookingPaymentTest(
  admin: SupabaseClient,
  bookingId: string,
  learnerUserId: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select(
      "booking_id, expert_user_id, learner_user_id, payment_status, booking_amount, extensions_amount, taxes_fees, discount_applied, total_amount",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (loadErr) {
    return { error: loadErr.message, status: 500 };
  }
  if (!booking) {
    return { error: "Booking not found", status: 404 };
  }
  if (booking.learner_user_id !== learnerUserId) {
    return { error: "Forbidden", status: 403 };
  }

  const ps = String(booking.payment_status ?? "").toLowerCase();
  if (ps === "paid" || ps === "succeeded") {
    return { ok: true };
  }
  if (ps !== "pending" && ps !== "failed") {
    return { error: "Booking is not waiting on card payment", status: 400 };
  }

  const { data: existingTx } = await admin
    .from("transactions")
    .select("transaction_id")
    .eq("booking_id", bookingId)
    .eq("transaction_type", "session_booking")
    .eq("status", "succeeded")
    .maybeSingle();

  if (existingTx) {
    return { ok: true };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from("bookings")
    .update({ payment_status: "paid", updated_at: now })
    .eq("booking_id", bookingId);

  if (updErr) {
    return { error: updErr.message, status: 500 };
  }

  const ok = await insertSessionBookingLedgerForTest(admin, booking, booking.total_amount);
  if (!ok) {
    return { error: "Could not record payment", status: 500 };
  }
  return { ok: true };
}

export async function completeDeferredSessionPaymentTest(
  admin: SupabaseClient,
  learnerUserId: string,
  params: {
    expertUserId: string;
    startUtcMs: number;
    durationMinutes: number;
    applyFirstSessionDiscount?: boolean;
  },
): Promise<{ ok: true; booking_id: string } | { error: string; status: number }> {
  const prepared = await prepareExpertSessionBooking(admin, {
    learnerUserId,
    expertUserId: params.expertUserId,
    startUtcMs: params.startUtcMs,
    durationMinutes: params.durationMinutes,
    applyFirstSessionDiscount: params.applyFirstSessionDiscount,
  });

  if (!prepared.ok) {
    return { error: prepared.error, status: prepared.status };
  }
  if (!prepared.data.autoAccept) {
    return { error: "This booking path is not instant checkout", status: 400 };
  }

  const d = prepared.data;
  const overlap = await expertHasBlockingBookingOverlap(
    admin,
    d.expertUserId,
    d.sessionDate,
    d.startTime,
    d.endTime,
  );
  if (overlap) {
    return { error: "That time slot is no longer available", status: 409 };
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insErr } = await admin
    .from("bookings")
    .insert({
      expert_user_id: d.expertUserId,
      learner_user_id: learnerUserId,
      expert_profile_id: d.expertProfileId,
      session_date: d.sessionDate,
      start_time: d.startTime,
      end_time: d.endTime,
      duration: d.durationPg,
      rate: d.rateHourly,
      discount_applied: d.discountApplied,
      booking_amount: d.pricing.booking_amount,
      platform_fee: d.pricing.platform_fee,
      taxes_fees: d.pricing.taxes_fees,
      total_amount: d.pricing.total_amount,
      status: "upcoming",
      payment_status: "paid",
      stripe_payment_intent_id: null,
      created_at: now,
      updated_at: now,
    })
    .select(
      "booking_id, expert_user_id, learner_user_id, booking_amount, extensions_amount, taxes_fees, discount_applied, total_amount",
    )
    .single();

  if (insErr || !inserted) {
    return { error: insErr?.message ?? "Insert failed", status: 500 };
  }

  const ok = await insertSessionBookingLedgerForTest(admin, inserted, d.pricing.total_amount);
  if (!ok) {
    await admin.from("bookings").delete().eq("booking_id", inserted.booking_id);
    return { error: "Could not record payment", status: 500 };
  }

  return { ok: true, booking_id: inserted.booking_id };
}

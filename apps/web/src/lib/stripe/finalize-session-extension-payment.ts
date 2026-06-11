import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import {
  SESSION_EXTENSION_BLOCK_MINUTES,
  effectiveSessionEndInstant,
  wallClockTimeOfDay,
} from "@/lib/liveSessionTiming";
import { sessionWallClockInstant } from "@/lib/sessionWallClock";
import { roundUsd2 } from "@/lib/sessionCheckoutPricing";

/**
 * `payment_intent.succeeded` for metadata `conveneSessionExtension=1`.
 * Idempotent: booking row must still be at `priorExtensions` for the update to apply.
 */
export async function finalizeSessionExtensionFromPaymentIntent(
  admin: SupabaseClient,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  const bookingId = (pi.metadata?.bookingId ?? "").trim();
  if (!bookingId) {
    console.info("[stripe] extension PI: no bookingId; skip");
    return;
  }

  const priorExtensions = Number((pi.metadata?.priorExtensions ?? "").trim());
  if (!Number.isFinite(priorExtensions) || priorExtensions < 0) {
    console.error("[stripe] extension PI: bad priorExtensions", pi.id);
    return;
  }

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select(
      "booking_id, expert_user_id, learner_user_id, session_date, start_time, end_time, extensions, extensions_amount, payment_status, duration",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (bookingErr || !booking) {
    console.error("[stripe] extension finalize: booking not found", bookingId, bookingErr?.message);
    return;
  }

  const ps = String(booking.payment_status ?? "").toLowerCase();
  if (ps !== "paid" && ps !== "succeeded") {
    console.error("[stripe] extension finalize: booking not paid", bookingId);
    return;
  }

  const learnerMeta = (pi.metadata?.learnerUserId ?? "").trim();
  if (learnerMeta && learnerMeta !== booking.learner_user_id) {
    console.warn("[stripe] extension finalize: learner mismatch", { learnerMeta });
  }

  const currentExt = Math.round(Number(booking.extensions ?? 0));
  if (!Number.isFinite(currentExt)) {
    console.error("[stripe] extension finalize: invalid extensions column", bookingId);
    return;
  }

  if (currentExt > priorExtensions) {
    console.info("[stripe] extension finalize: already applied (extensions advanced)", bookingId);
    return;
  }
  if (currentExt !== priorExtensions) {
    console.error("[stripe] extension finalize: stale priorExtensions vs DB", {
      bookingId,
      currentExt,
      priorExtensions,
    });
    return;
  }

  const effectiveEnd = effectiveSessionEndInstant(
    String(booking.session_date ?? ""),
    booking.end_time as string,
    currentExt,
  );
  if (!effectiveEnd) {
    console.error("[stripe] extension finalize: could not parse end", bookingId);
    return;
  }

  const newEndDate = new Date(effectiveEnd.getTime() + SESSION_EXTENSION_BLOCK_MINUTES * 60_000);
  const sessionDateStr = String(booking.session_date ?? "");
  const y = newEndDate.getFullYear();
  const mo = newEndDate.getMonth() + 1;
  const da = newEndDate.getDate();
  const newDay = `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
  if (newDay !== sessionDateStr) {
    console.error("[stripe] extension finalize: crosses calendar day; not supported", bookingId);
    return;
  }

  const newEndTime = wallClockTimeOfDay(newEndDate);
  const addExtAmount = roundUsd2(Number((pi.metadata?.extensionBookingAmountUsd ?? "").trim()) || 0);
  const metaPf = Number((pi.metadata?.extensionPlatformFeeUsd ?? "").trim());
  const metaTax = Number((pi.metadata?.extensionTaxesFeesUsd ?? "").trim());
  const newExtensionsAmount = roundUsd2(Number(booking.extensions_amount ?? 0) + addExtAmount);

  const amountCents = pi.amount_received ?? pi.amount;
  const feeCents = pi.application_fee_amount ?? Math.round(amountCents * 0.1);
  const totalCharge = amountCents / 100;
  const platformFee = Number.isFinite(metaPf) && metaPf >= 0 ? metaPf : feeCents / 100;
  const taxesFees = Number.isFinite(metaTax) && metaTax >= 0 ? metaTax : Math.max(0, totalCharge - platformFee - addExtAmount);
  const expertEarnings = addExtAmount;
  const now = new Date().toISOString();

  const startInst = sessionWallClockInstant(sessionDateStr, booking.start_time as string);
  const newDurMin =
    startInst ?
      Math.max(15, Math.round((newEndDate.getTime() - startInst.getTime()) / 60_000))
    : 15;

  const { data: updated, error: upErr } = await admin
    .from("bookings")
    .update({
      extensions: currentExt + 1,
      extensions_amount: newExtensionsAmount,
      end_time: newEndTime,
      duration: `${newDurMin} minutes`,
      updated_at: now,
    })
    .eq("booking_id", bookingId)
    .eq("extensions", priorExtensions)
    .select("booking_id");

  if (upErr) {
    console.error("[stripe] extension finalize: booking update failed", upErr.message);
    return;
  }
  if (!updated?.length) {
    console.info("[stripe] extension finalize: no row updated (race/duplicate)", bookingId);
    return;
  }

  const { error: txErr } = await admin.from("transactions").insert({
    transaction_type: "session_extension",
    booking_id: booking.booking_id,
    expert_user_id: booking.expert_user_id,
    learner_user_id: booking.learner_user_id,
    booking_amount: addExtAmount,
    extensions_amount: addExtAmount,
    platform_fee: platformFee,
    taxes_fees: taxesFees,
    total_charge: totalCharge,
    expert_earnings: expertEarnings,
    status: "succeeded",
    payment_method: `stripe:${pi.id}`,
    transaction_date: now,
    updated_at: now,
  });

  if (txErr) {
    console.error("[stripe] extension finalize: transaction insert failed", txErr.message);
  }
}

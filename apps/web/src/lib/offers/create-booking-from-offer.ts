import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeWallTimeForPg } from "@/lib/offers/session-time";
import { expertHasBlockingBookingOverlap } from "@/lib/session-booking-prepare";

type OfferRow = {
  offer_id: string;
  from_user_id: string;
  to_user_id: string;
  payload: Record<string, unknown>;
};

export function isSessionOfferPayload(payload: Record<string, unknown>): boolean {
  const date = payload.proposed_session_date ?? payload.session_date;
  const start = payload.start_time;
  const end = payload.end_time;
  return Boolean(date && start && end);
}

/** Create a learner booking from an accepted session-style offer (custom pricing in payload). */
export async function createBookingFromSessionOffer(
  admin: SupabaseClient,
  offer: OfferRow,
): Promise<{ ok: true; bookingId: string } | { ok: false; error: string; status: number }> {
  const payload = offer.payload;
  if (!isSessionOfferPayload(payload)) {
    return { ok: false, error: "Offer is missing session date or times", status: 400 };
  }

  const quote = payload.quote_breakdown;
  if (!quote || typeof quote !== "object") {
    return { ok: false, error: "Offer is missing price breakdown", status: 400 };
  }
  const q = quote as Record<string, unknown>;
  const bookingAmount = Number(q.booking_fee_usd);
  const platformFee = Number(q.platform_fee_usd);
  const taxesFees = Number(q.taxes_and_fees_usd);
  const totalAmount = Number(q.total_offer_price_usd);
  if (
    ![bookingAmount, platformFee, taxesFees, totalAmount].every(
      (n) => Number.isFinite(n) && n >= 0,
    ) ||
    totalAmount <= 0
  ) {
    return { ok: false, error: "Offer has invalid pricing", status: 400 };
  }

  const sessionDate = String(payload.proposed_session_date ?? payload.session_date).trim();
  const startTime = normalizeWallTimeForPg(payload.start_time);
  const endTime = normalizeWallTimeForPg(payload.end_time);
  if (!sessionDate || !startTime || !endTime) {
    return { ok: false, error: "Invalid session date or times in offer", status: 400 };
  }

  const durationMinutes = Number(payload.duration_minutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return { ok: false, error: "Offer is missing session duration", status: 400 };
  }

  const expertUserId = offer.from_user_id;
  const learnerUserId = offer.to_user_id;

  const { data: expertProfile, error: profErr } = await admin
    .from("expert_profiles")
    .select("expert_profile_id")
    .eq("user_id", expertUserId)
    .maybeSingle();
  if (profErr) {
    return { ok: false, error: profErr.message, status: 500 };
  }
  if (!expertProfile?.expert_profile_id) {
    return { ok: false, error: "Expert profile not found", status: 404 };
  }

  const overlap = await expertHasBlockingBookingOverlap(
    admin,
    expertUserId,
    sessionDate,
    startTime,
    endTime,
  );
  if (overlap) {
    return { ok: false, error: "That time slot is no longer available", status: 409 };
  }

  const hours = durationMinutes / 60;
  const rateHourly = hours > 0 ? Math.round((bookingAmount / hours) * 100) / 100 : 0;
  const now = new Date().toISOString();

  const { data: booking, error: insErr } = await admin
    .from("bookings")
    .insert({
      expert_user_id: expertUserId,
      learner_user_id: learnerUserId,
      expert_profile_id: expertProfile.expert_profile_id,
      session_date: sessionDate,
      start_time: startTime,
      end_time: endTime,
      duration: `${durationMinutes} minutes`,
      rate: rateHourly,
      discount_applied: 0,
      booking_amount: bookingAmount,
      platform_fee: platformFee,
      taxes_fees: taxesFees,
      total_amount: totalAmount,
      status: "upcoming",
      payment_status: "pending",
      created_at: now,
      updated_at: now,
    })
    .select("booking_id")
    .single();

  if (insErr || !booking?.booking_id) {
    return { ok: false, error: insErr?.message ?? "Could not create booking", status: 500 };
  }

  const bookingId = String(booking.booking_id);
  const { error: offerErr } = await admin
    .from("offers")
    .update({
      status: "accepted",
      creates_booking_id: bookingId,
      updated_at: now,
    })
    .eq("offer_id", offer.offer_id);

  if (offerErr) {
    return { ok: false, error: offerErr.message, status: 500 };
  }

  return { ok: true, bookingId };
}

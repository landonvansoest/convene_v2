import type { SupabaseClient } from "@supabase/supabase-js";
import { intervalStringToMinutes } from "@/lib/expert-registration";
import {
  SESSION_EXTENSION_BLOCK_MINUTES,
  minutesRemainingEffective,
  wallClockTimeOfDay,
} from "@/lib/liveSessionTiming";
import { bookingPaymentIsSettled, sessionWallClockInstant } from "@/lib/sessionWallClock";
import { expertHasBlockingBookingOverlap } from "@/lib/session-booking-prepare";
import {
  computeSessionCheckoutPricing,
  roundUsd2,
  type SessionCheckoutPricing,
} from "@/lib/sessionCheckoutPricing";

export type SessionLiveTimingPayload = {
  minutes_remaining: number | null;
  extend_offer_eligible: boolean;
  extend_sessions_enabled: boolean;
  extension_pricing: SessionCheckoutPricing | null;
};

type BookingTimingRow = {
  booking_id: string;
  expert_user_id: string;
  learner_user_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string | null;
  cancelled_at: string | null;
  payment_status: string | null;
  extensions?: number | null;
};

export async function buildSessionLiveTimingPayload(
  admin: SupabaseClient,
  booking: BookingTimingRow,
  viewerIsLearner: boolean,
): Promise<SessionLiveTimingPayload> {
  const { data: av } = await admin
    .from("expert_availability")
    .select("extend_sessions, rate, maximum_booking")
    .eq("user_id", booking.expert_user_id)
    .maybeSingle();

  const extendSessions = Boolean(av?.extend_sessions ?? false);
  const ratePer15 = Number(av?.rate ?? 0);
  const extensionPricing =
    Number.isFinite(ratePer15) && ratePer15 > 0 ?
      computeSessionCheckoutPricing(roundUsd2(ratePer15))
    : null;

  const now = Date.now();
  const minutesRemaining = minutesRemainingEffective(
    booking.session_date,
    booking.end_time,
    booking.extensions,
    now,
  );

  const st = String(booking.status ?? "").toLowerCase();
  const paid = bookingPaymentIsSettled(booking.payment_status);
  const cancelled = st === "cancelled" || Boolean(booking.cancelled_at);

  let extendOfferEligible = false;
  if (
    viewerIsLearner &&
    extendSessions &&
    paid &&
    !cancelled &&
    minutesRemaining != null &&
    minutesRemaining > 0 &&
    minutesRemaining <= 10 &&
    extensionPricing
  ) {
    const startInst = sessionWallClockInstant(booking.session_date, booking.start_time);
    const endInst = sessionWallClockInstant(booking.session_date, booking.end_time);
    const maxM = intervalStringToMinutes(av?.maximum_booking as string | null | undefined) ?? 24 * 60;
    let withinMax = true;
    if (startInst && endInst) {
      const curLenMin = (endInst.getTime() - startInst.getTime()) / 60_000;
      withinMax = curLenMin + SESSION_EXTENSION_BLOCK_MINUTES <= maxM + 0.001;
    }

    if (withinMax && endInst) {
      const extEnd = new Date(endInst.getTime() + SESSION_EXTENSION_BLOCK_MINUTES * 60_000);
      const y = extEnd.getFullYear();
      const mo = extEnd.getMonth() + 1;
      const da = extEnd.getDate();
      const dayStr = `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
      if (dayStr === booking.session_date) {
        const overlap = await expertHasBlockingBookingOverlap(
          admin,
          booking.expert_user_id,
          booking.session_date,
          wallClockTimeOfDay(endInst),
          wallClockTimeOfDay(extEnd),
          booking.booking_id,
        );
        extendOfferEligible = !overlap;
      }
    }
  }

  return {
    minutes_remaining: minutesRemaining,
    extend_offer_eligible: extendOfferEligible,
    extend_sessions_enabled: extendSessions,
    extension_pricing: extensionPricing,
  };
}

export type ValidatedSessionExtension = {
  pricing: SessionCheckoutPricing;
  priorExtensions: number;
  expertUserId: string;
  bookingId: string;
  learnerUserId: string;
};

export async function validateSessionExtensionPurchase(
  admin: SupabaseClient,
  booking: BookingTimingRow,
  learnerId: string,
): Promise<
  | { ok: true; data: ValidatedSessionExtension }
  | { ok: false; status: number; error: string }
> {
  if (booking.learner_user_id !== learnerId) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const st = String(booking.status ?? "").toLowerCase();
  const paid = bookingPaymentIsSettled(booking.payment_status);
  const cancelled = st === "cancelled" || Boolean(booking.cancelled_at);
  if (!paid) {
    return { ok: false, status: 400, error: "Session must be paid to extend" };
  }
  if (cancelled) {
    return { ok: false, status: 400, error: "Cancelled sessions cannot be extended" };
  }

  const { data: av } = await admin
    .from("expert_availability")
    .select("extend_sessions, rate, maximum_booking")
    .eq("user_id", booking.expert_user_id)
    .maybeSingle();

  if (!av?.extend_sessions) {
    return { ok: false, status: 400, error: "This expert does not allow session extensions" };
  }

  const ratePer15 = Number(av.rate ?? 0);
  if (!Number.isFinite(ratePer15) || ratePer15 <= 0) {
    return { ok: false, status: 400, error: "Expert rate is not available" };
  }
  const pricing = computeSessionCheckoutPricing(roundUsd2(ratePer15));

  const now = Date.now();
  const minutesRemaining = minutesRemainingEffective(
    booking.session_date,
    booking.end_time,
    booking.extensions,
    now,
  );
  if (minutesRemaining == null) {
    return { ok: false, status: 400, error: "Could not read session end time" };
  }
  if (minutesRemaining <= 0) {
    return { ok: false, status: 400, error: "Session has already ended" };
  }
  if (minutesRemaining > 10) {
    return { ok: false, status: 400, error: "Extensions are only available in the last 10 minutes" };
  }

  const startInst = sessionWallClockInstant(booking.session_date, booking.start_time);
  const endInst = sessionWallClockInstant(booking.session_date, booking.end_time);
  const maxM = intervalStringToMinutes(av.maximum_booking as string | null | undefined) ?? 24 * 60;
  if (startInst && endInst) {
    const curLenMin = (endInst.getTime() - startInst.getTime()) / 60_000;
    if (curLenMin + SESSION_EXTENSION_BLOCK_MINUTES > maxM + 0.001) {
      return {
        ok: false,
        status: 400,
        error: `Session cannot exceed ${maxM} minutes`,
      };
    }
  }

  if (!endInst) {
    return { ok: false, status: 400, error: "Invalid session end time" };
  }

  const extEnd = new Date(endInst.getTime() + SESSION_EXTENSION_BLOCK_MINUTES * 60_000);
  const y = extEnd.getFullYear();
  const mo = extEnd.getMonth() + 1;
  const da = extEnd.getDate();
  const dayStr = `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
  if (dayStr !== booking.session_date) {
    return { ok: false, status: 400, error: "Extension cannot cross midnight" };
  }

  const overlap = await expertHasBlockingBookingOverlap(
    admin,
    booking.expert_user_id,
    booking.session_date,
    wallClockTimeOfDay(endInst),
    wallClockTimeOfDay(extEnd),
    booking.booking_id,
  );
  if (overlap) {
    return {
      ok: false,
      status: 409,
      error: "The expert’s next time block is not available",
    };
  }

  const priorExtensions = Math.max(0, Math.round(Number(booking.extensions ?? 0)));
  if (!Number.isFinite(priorExtensions)) {
    return { ok: false, status: 500, error: "Invalid extensions on booking" };
  }

  return {
    ok: true,
    data: {
      pricing,
      priorExtensions,
      expertUserId: booking.expert_user_id,
      bookingId: booking.booking_id,
      learnerUserId: learnerId,
    },
  };
}

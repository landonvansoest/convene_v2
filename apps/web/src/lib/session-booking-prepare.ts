import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingTimesForPg, parseMinBookingMinutes } from "@/lib/expertBookingPreview";
import {
  fetchExpertBlockingIntervals,
  proposedSessionOverlapsBlockingIntervals,
  timeStrToSec,
} from "@/lib/expert-booking-blocks";
import { intervalStringToMinutes } from "@/lib/expert-registration";
import { expertRequiresPackagePurchaseForLearner } from "@/lib/packages/package-deal";
import { validatePackageCreditForBooking } from "@/lib/packages/learner-package-credits";
import { evaluateFirstSessionDiscount, firstSessionBookingDurationBounds, learnerHasPaidSessionWithExpert } from "@/lib/pricing/first-session-discount";
import { computeSessionCheckoutPricing, roundUsd2, type SessionCheckoutPricing } from "@/lib/sessionCheckoutPricing";

export type PreparedExpertSessionBooking = {
  expertUserId: string;
  learnerUserId: string;
  expertProfileId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  durationPg: string;
  rateHourly: number;
  discountApplied: number;
  pricing: SessionCheckoutPricing;
  autoAccept: boolean;
  packageCreditId: string | null;
  packageCreditRedemption: boolean;
};

export type PrepareExpertSessionBookingResult =
  | { ok: true; data: PreparedExpertSessionBooking }
  | { ok: false; status: number; error: string };

/**
 * Validates expert session booking input and computes pricing (shared by POST /bookings and create-payment-intent).
 */
export async function prepareExpertSessionBooking(
  admin: SupabaseClient,
  input: {
    learnerUserId: string;
    expertUserId: string;
    startUtcMs: number;
    durationMinutes: number;
    applyFirstSessionDiscount?: boolean;
    packageCreditId?: string;
  },
): Promise<PrepareExpertSessionBookingResult> {
  const { learnerUserId, expertUserId, startUtcMs, durationMinutes, applyFirstSessionDiscount, packageCreditId } =
    input;

  if (learnerUserId === expertUserId) {
    return { ok: false, status: 400, error: "Cannot book your own profile" };
  }

  if (durationMinutes % 15 !== 0) {
    return { ok: false, status: 400, error: "Duration must be in 15-minute increments" };
  }

  const [{ data: expertUser, error: uErr }, { data: av, error: avErr }, { data: expertProfile, error: pErr }] =
    await Promise.all([
      admin.from("users").select("user_id, time_zone").eq("user_id", expertUserId).maybeSingle(),
      admin
        .from("expert_availability")
        .select(
          "rate, minimum_booking, maximum_booking, auto_accept, calendar_paused, package_deal_enabled, package_require_purchase, package_require_purchase_after_first_session, first_session_discount_enabled, first_session_discount_max_session_minutes",
        )
        .eq("user_id", expertUserId)
        .maybeSingle(),
      admin.from("expert_profiles").select("expert_profile_id").eq("user_id", expertUserId).maybeSingle(),
    ]);

  if (uErr) return { ok: false, status: 500, error: uErr.message };
  if (!expertUser) return { ok: false, status: 404, error: "Expert not found" };
  if (avErr) return { ok: false, status: 500, error: avErr.message };
  if (!av || av.calendar_paused) {
    return { ok: false, status: 400, error: "Expert calendar is not accepting bookings" };
  }
  if (pErr) return { ok: false, status: 500, error: pErr.message };
  if (!expertProfile) return { ok: false, status: 404, error: "Expert profile not found" };

  const tz = expertUser.time_zone ?? "UTC";
  const ratePer15 = Number(av.rate ?? 0);
  if (!Number.isFinite(ratePer15) || ratePer15 <= 0) {
    return { ok: false, status: 400, error: "Expert has no public rate" };
  }

  const minM = parseMinBookingMinutes(av.minimum_booking);
  const maxM = intervalStringToMinutes(av.maximum_booking) ?? 24 * 60;

  const learnerHasPaidSession = await learnerHasPaidSessionWithExpert(
    admin,
    expertUserId,
    learnerUserId,
  );

  const durationBounds = firstSessionBookingDurationBounds({
    minBookingMinutes: minM,
    maxBookingMinutes: maxM,
    firstSessionDiscountEnabled:
      Boolean(av.first_session_discount_enabled) ||
      Boolean(av.package_deal_enabled && av.package_require_purchase_after_first_session),
    firstSessionDiscountMaxSessionMinutes: av.first_session_discount_max_session_minutes,
    learnerHasPaidSession,
    packageRequireAfterFirst: Boolean(
      av.package_deal_enabled && av.package_require_purchase_after_first_session,
    ),
  });
  if (durationMinutes < durationBounds.minMinutes) {
    return { ok: false, status: 400, error: `Duration must be at least ${durationBounds.minMinutes} minutes` };
  }
  if (durationMinutes > durationBounds.maxMinutes) {
    return { ok: false, status: 400, error: `Duration may not exceed ${durationBounds.maxMinutes} minutes` };
  }
  const requiresPackage = expertRequiresPackagePurchaseForLearner(av, learnerHasPaidSession);

  if (requiresPackage && !packageCreditId) {
    return {
      ok: false,
      status: 403,
      error: learnerHasPaidSession
        ? "This expert requires purchasing a package before booking additional sessions. Buy a package below, then schedule a session."
        : "This expert requires purchasing a package before booking. Buy a package below, then schedule a session.",
    };
  }

  if (packageCreditId && applyFirstSessionDiscount) {
    return {
      ok: false,
      status: 400,
      error: "Cannot combine package credit with first-session discount",
    };
  }

  const numBlocks = durationMinutes / 15;
  const listBookingFee = roundUsd2(ratePer15 * numBlocks);

  let bookingFeeAfterDiscount = listBookingFee;
  let discountApplied = 0;
  let packageCreditRedemption = false;

  if (packageCreditId) {
    const creditCheck = await validatePackageCreditForBooking(admin, {
      creditId: packageCreditId,
      learnerUserId,
      expertUserId,
      durationMinutes,
    });
    if (!creditCheck.ok) {
      return { ok: false, status: creditCheck.status, error: creditCheck.error };
    }
    packageCreditRedemption = true;
    bookingFeeAfterDiscount = 0;
  } else if (applyFirstSessionDiscount) {
    const evalResult = await evaluateFirstSessionDiscount(admin, {
      expertUserId,
      learnerUserId,
      durationMinutes,
      listPriceUsd: listBookingFee,
    });
    if (!evalResult.eligible) {
      return { ok: false, status: 400, error: evalResult.reason };
    }
    discountApplied = evalResult.discountUsd;
    bookingFeeAfterDiscount = evalResult.chargedUsd;
  }

  const pricing = packageCreditRedemption
    ? {
        booking_amount: 0,
        platform_fee: 0,
        subtotal_before_tax: 0,
        taxes_fees: 0,
        total_amount: 0,
      }
    : computeSessionCheckoutPricing(bookingFeeAfterDiscount);
  const endUtcMs = startUtcMs + durationMinutes * 60_000;
  const times = bookingTimesForPg(startUtcMs, endUtcMs, tz);
  if (!times) {
    return { ok: false, status: 400, error: "Session must start and end on the same calendar day" };
  }

  const overlap = await expertHasBlockingBookingOverlap(
    admin,
    expertUserId,
    times.sessionDate,
    times.startTime,
    times.endTime,
  );
  if (overlap) {
    return { ok: false, status: 409, error: "That time slot is no longer available" };
  }

  const hours = durationMinutes / 60;
  const rateHourly = hours > 0 ? roundUsd2(pricing.booking_amount / hours) : ratePer15 * 4;

  return {
    ok: true,
    data: {
      expertUserId,
      learnerUserId,
      expertProfileId: expertProfile.expert_profile_id,
      sessionDate: times.sessionDate,
      startTime: times.startTime,
      endTime: times.endTime,
      durationMinutes,
      durationPg: `${durationMinutes} minutes`,
      rateHourly,
      discountApplied,
      pricing,
      autoAccept: Boolean(av.auto_accept),
      packageCreditId: packageCreditId ?? null,
      packageCreditRedemption,
    },
  };
}

export async function expertHasBlockingBookingOverlap(
  admin: SupabaseClient,
  expertUserId: string,
  sessionDate: string,
  startTime: string,
  endTime: string,
  excludeBookingId?: string | null,
): Promise<boolean> {
  const newS = timeStrToSec(startTime);
  const newE = timeStrToSec(endTime);
  if (newE <= newS) return true;

  let q = admin
    .from("bookings")
    .select("booking_id, start_time, end_time, payment_status")
    .eq("expert_user_id", expertUserId)
    .eq("session_date", sessionDate)
    .neq("status", "cancelled");

  const ex = typeof excludeBookingId === "string" && excludeBookingId.trim() !== "" ? excludeBookingId.trim() : null;
  if (ex) {
    q = q.neq("booking_id", ex);
  }

  const { data: rows, error } = await q;

  if (error || !rows?.length) return false;

  const intervals = rows
    .map((r) => ({
      sessionDate,
      startSec: timeStrToSec(String(r.start_time ?? "")),
      endSec: timeStrToSec(String(r.end_time ?? "")),
      payment_status: r.payment_status,
    }))
    .filter((r) => {
      const ps = String(r.payment_status ?? "").toLowerCase();
      return ps !== "failed" && r.endSec > r.startSec;
    })
    .map(({ sessionDate: d, startSec, endSec }) => ({ sessionDate: d, startSec, endSec }));

  return proposedSessionOverlapsBlockingIntervals(sessionDate, newS, newE, intervals);
}

export { fetchExpertBlockingIntervals };

import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingTimesForPg, parseMinBookingMinutes } from "@/lib/expertBookingPreview";
import { intervalStringToMinutes } from "@/lib/expert-registration";
import { evaluateFirstSessionDiscount } from "@/lib/pricing/first-session-discount";
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
  },
): Promise<PrepareExpertSessionBookingResult> {
  const { learnerUserId, expertUserId, startUtcMs, durationMinutes, applyFirstSessionDiscount } = input;

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
        .select("rate, minimum_booking, maximum_booking, auto_accept, calendar_paused")
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
  if (durationMinutes < minM) {
    return { ok: false, status: 400, error: `Duration must be at least ${minM} minutes` };
  }
  if (durationMinutes > maxM) {
    return { ok: false, status: 400, error: `Duration may not exceed ${maxM} minutes` };
  }

  const numBlocks = durationMinutes / 15;
  const listBookingFee = roundUsd2(ratePer15 * numBlocks);

  let bookingFeeAfterDiscount = listBookingFee;
  let discountApplied = 0;

  if (applyFirstSessionDiscount) {
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

  const pricing = computeSessionCheckoutPricing(bookingFeeAfterDiscount);
  const endUtcMs = startUtcMs + durationMinutes * 60_000;
  const times = bookingTimesForPg(startUtcMs, endUtcMs, tz);
  if (!times) {
    return { ok: false, status: 400, error: "Session must start and end on the same calendar day" };
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
    },
  };
}

function timeStrToSec(t: string): number {
  const parts = String(t).trim().split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  const s = Number(parts[2] ?? 0);
  if (![h, m, s].every((n) => Number.isFinite(n))) return 0;
  return h * 3600 + m * 60 + s;
}

/**
 * True if another non-cancelled booking blocks this wall-clock interval (same calendar day in expert TZ).
 * Counts rows that are not failed payments (pending / awaiting_expert / paid hold the slot).
 */
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

  for (const r of rows) {
    const ps = String(r.payment_status ?? "").toLowerCase();
    if (ps === "failed") continue;
    const rs = timeStrToSec(String(r.start_time ?? ""));
    const re = timeStrToSec(String(r.end_time ?? ""));
    if (re <= rs) continue;
    if (newS < re && rs < newE) return true;
  }
  return false;
}

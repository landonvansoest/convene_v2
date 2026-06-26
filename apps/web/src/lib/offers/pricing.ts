import { roundUsd2 } from "@/lib/sessionCheckoutPricing";
import { durationMinutesBetweenWallTimes } from "@/lib/offers/session-time";

/** Round session length up to the next 15-minute booking block. */
export function ceilToBookingBlockMinutes(rawMinutes: number): number {
  if (!Number.isFinite(rawMinutes) || rawMinutes <= 0) return 0;
  return Math.ceil(rawMinutes / 15) * 15;
}

/** Session booking fee from the expert's published rate per 15 minutes. */
export function sessionBookingFeeFromRatePer15(
  ratePer15Min: number,
  durationMinutes: number,
): number | null {
  const rate = Number(ratePer15Min);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes % 15 !== 0) {
    return null;
  }
  return roundUsd2(rate * (durationMinutes / 15));
}

/** Derive billable minutes + fee from a same-day start/end window. */
export function sessionFeeFromWallTimes(
  ratePer15Min: number,
  startHm: string,
  endHm: string,
): { durationMinutes: number; bookingFeeUsd: number } | null {
  const raw = durationMinutesBetweenWallTimes(startHm, endHm);
  if (raw == null) return null;
  const durationMinutes = ceilToBookingBlockMinutes(raw);
  const bookingFeeUsd = sessionBookingFeeFromRatePer15(ratePer15Min, durationMinutes);
  if (bookingFeeUsd == null) return null;
  return { durationMinutes, bookingFeeUsd };
}

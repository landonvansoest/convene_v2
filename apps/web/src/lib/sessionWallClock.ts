/** Parse `session_date` + time as local wall clock (same as dashboard session cards). */
export function sessionWallClockInstant(sessionDate: string, time: string | undefined | null): Date | null {
  if (!sessionDate) return null;
  const st = (time || "00:00:00").toString();
  const timePart =
    st.length >= 8 ? st.slice(0, 8) : st.length >= 5 ? `${st.slice(0, 5)}:00` : "00:00:00";
  const dt = new Date(`${sessionDate}T${timePart}`);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

/** True once scheduled end time has passed, independent of DB `status`. */
export function hasSessionEndedByWallClock(
  sessionDate: string | undefined | null,
  endTime: string | undefined | null,
): boolean {
  const end = sessionWallClockInstant(String(sessionDate ?? ""), endTime);
  if (!end) return false;
  return Date.now() >= end.getTime();
}

export function bookingPaymentIsSettled(paymentStatus: unknown): boolean {
  const ps = String(paymentStatus ?? "").toLowerCase();
  return ps === "paid" || ps === "succeeded";
}

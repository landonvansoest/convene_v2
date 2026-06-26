/** Join is allowed this many ms before scheduled start (matches dashboard Join Session button). */
export const SESSION_JOIN_WINDOW_MS = 10 * 60 * 1000;

/** True when the session join window is open (10 minutes before scheduled start). */
export function isSessionJoinWindowOpen(
  sessionDate: string | undefined | null,
  startTime: string | undefined | null,
  nowMs: number = Date.now(),
): boolean {
  const start = sessionWallClockInstant(String(sessionDate ?? ""), startTime);
  if (!start) return false;
  return nowMs >= start.getTime() - SESSION_JOIN_WINDOW_MS;
}

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

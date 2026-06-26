/** Shared {{variables}} for booking-related message templates. */

export type BookingScheduleFields = {
  session_date: string;
  start_time: string;
  end_time?: string | null;
  duration?: string | null;
  /** Expert session fee (before platform fee & tax). */
  booking_amount?: number | string | null;
  total_amount?: number | string | null;
  booking_id?: string;
};

function normalizeTimePart(time: string): string {
  const st = String(time || "00:00:00");
  if (st.length >= 8) return st.slice(0, 8);
  if (st.length >= 5) return `${st.slice(0, 5)}:00`;
  return "00:00:00";
}

export function formatSessionDate(sessionDate: string, startTime: string): string {
  const start = new Date(`${sessionDate}T${normalizeTimePart(startTime)}`);
  if (!Number.isFinite(start.getTime())) return String(sessionDate);
  return start.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatSessionTime(sessionDate: string, time: string): string {
  const dt = new Date(`${sessionDate}T${normalizeTimePart(time)}`);
  if (!Number.isFinite(dt.getTime())) return String(time).slice(0, 5);
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function parseTimeToMinutes(val: string | null | undefined): number | null {
  if (!val) return null;
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.\d+)?$/.exec(String(val));
  if (!m) return null;
  const hh = Number(m[1] ?? 0);
  const mm = Number(m[2]);
  return hh * 60 + mm;
}

/** Human-readable duration for emails, e.g. "45 minutes" or "1 hour 15 minutes". */
export function formatSessionDuration(
  interval: string | null | undefined,
  startTime?: string | null,
  endTime?: string | null,
): string {
  let minutes: number | null = parseTimeToMinutes(interval);
  if (minutes == null && startTime && endTime) {
    const s = parseTimeToMinutes(startTime);
    const e = parseTimeToMinutes(endTime);
    if (s != null && e != null && e >= s) minutes = e - s;
  }
  if (minutes == null || minutes <= 0) return "";

  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hourPart = h === 1 ? "1 hour" : `${h} hours`;
  if (m === 0) return hourPart;
  const minPart = m === 1 ? "1 minute" : `${m} minutes`;
  return `${hourPart} ${minPart}`;
}

export function formatMoney(amount: number | string | null | undefined): string {
  if (amount == null || amount === "") return "";
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "";
  return `$${n.toFixed(2)}`;
}

/** @deprecated Use formatMoney — kept as alias for clarity at call sites. */
export const formatTotalPaid = formatMoney;

export function buildDashboardUrlVars(appBaseUrl?: string): Record<string, string> {
  const base = appBaseUrl?.replace(/\/$/, "") ?? "";
  const prefix = base || "";
  return {
    bookings_url: `${prefix}/dashboard?view=sessions`,
    sessions_url: `${prefix}/dashboard?view=sessions`,
    inbox_url: `${prefix}/dashboard?view=inbox`,
    dashboard_url: `${prefix}/dashboard?view=inbox`,
  };
}

export function buildBookingScheduleVars(
  booking: BookingScheduleFields,
  appBaseUrl?: string,
): Record<string, string> {
  const sessionDate = formatSessionDate(booking.session_date, booking.start_time);
  const sessionStartTime = formatSessionTime(booking.session_date, booking.start_time);
  const sessionEndTime = booking.end_time
    ? formatSessionTime(booking.session_date, booking.end_time)
    : "";
  const sessionDuration = formatSessionDuration(
    booking.duration,
    booking.start_time,
    booking.end_time,
  );
  const sessionFee = formatMoney(booking.booking_amount);
  const totalPaid = formatMoney(booking.total_amount);
  const base = appBaseUrl?.replace(/\/$/, "") ?? "";
  const sessionLink =
    booking.booking_id && base ? `${base}/session/${booking.booking_id}` : "";

  return {
    ...buildDashboardUrlVars(base || undefined),
    session_date: sessionDate,
    session_time: sessionStartTime,
    session_start_time: sessionStartTime,
    session_end_time: sessionEndTime,
    session_duration: sessionDuration,
    session_fee: sessionFee,
    total_paid: totalPaid,
    ...(sessionLink ? { session_link: sessionLink } : {}),
  };
}

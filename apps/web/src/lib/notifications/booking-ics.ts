/**
 * RFC 5545 iCalendar (.ics) for booking confirmation emails.
 * Session wall-clock times (session_date + start_time) are interpreted in the expert's IANA zone.
 */

export type BuildBookingIcsInput = {
  bookingId: string;
  sessionDate: string;
  startTime: string;
  endTime?: string | null;
  duration?: string | null;
  /** Expert IANA timezone — canonical zone for session wall-clock fields. */
  timeZone: string;
  summary: string;
  expertName: string;
  learnerName: string;
  /** Direct session room URL (`/session/{booking_id}`). */
  sessionLink: string;
  /** Dashboard booked sessions URL. */
  dashboardLink: string;
  appHost?: string;
};

export function buildBookingIcsDescription(input: {
  expertName: string;
  learnerName: string;
  sessionLink: string;
  dashboardLink: string;
}): string {
  return [
    `Expert: ${input.expertName}`,
    `Learner: ${input.learnerName}`,
    "",
    `Join session: ${input.sessionLink}`,
    `Booked sessions: ${input.dashboardLink}`,
  ].join("\n");
}

function normalizeTimePart(time: string): string {
  const st = String(time || "00:00:00");
  if (st.length >= 8) return st.slice(0, 8);
  if (st.length >= 5) return `${st.slice(0, 5)}:00`;
  return "00:00:00";
}

export function normalizeToSafeIanaTimeZone(input: string | null | undefined): string {
  const z = (input ?? "UTC").trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: z }).format(new Date(0));
    return z;
  } catch {
    return "UTC";
  }
}

/** Offset (ms) of `timeZone` at instant `date` — positive when local is ahead of UTC. */
function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/** Convert session wall-clock in `timeZone` to a UTC instant. */
export function wallClockInZoneToUtc(
  sessionDate: string,
  time: string,
  timeZone: string,
): Date | null {
  const datePart = String(sessionDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi, s] = normalizeTimePart(time).split(":").map(Number);
  if (![y, mo, d, h, mi, s].every((n) => Number.isFinite(n))) return null;

  const safeTz = normalizeToSafeIanaTimeZone(timeZone);
  let utcMs = Date.UTC(y, mo - 1, d, h, mi, s);
  for (let i = 0; i < 3; i++) {
    utcMs = Date.UTC(y, mo - 1, d, h, mi, s) - getTimeZoneOffsetMs(new Date(utcMs), safeTz);
  }
  const dt = new Date(utcMs);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function parseTimeToMinutes(val: string | null | undefined): number | null {
  if (!val) return null;
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.\d+)?$/.exec(String(val));
  if (!m) return null;
  const hh = Number(m[1] ?? 0);
  const mm = Number(m[2]);
  return hh * 60 + mm;
}

function durationMinutes(
  duration: string | null | undefined,
  startTime: string,
  endTime: string | null | undefined,
): number | null {
  let minutes = parseTimeToMinutes(duration);
  if (minutes == null && /(\d+)\s*minutes?/i.test(String(duration ?? ""))) {
    minutes = Number(String(duration).match(/(\d+)\s*minutes?/i)![1]);
  }
  if (minutes == null && endTime) {
    const s = parseTimeToMinutes(startTime);
    const e = parseTimeToMinutes(endTime);
    if (s != null && e != null && e >= s) minutes = e - s;
  }
  if (minutes == null || minutes <= 0) return null;
  return minutes;
}

function formatIcsUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n");
}

function foldIcsLine(line: string): string {
  const max = 75;
  if (line.length <= max) return line;
  const parts: string[] = [line.slice(0, max)];
  let rest = line.slice(max);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, max - 1)}`);
    rest = rest.slice(max - 1);
  }
  return parts.join("\r\n");
}

function icsUid(bookingId: string, appHost?: string): string {
  const host = (appHost ?? "convene.io").replace(/^www\./, "");
  return `booking-${bookingId}@${host}`;
}

/** Default calendar-app reminder offset (matches Convene 15-minute reminder email). */
const DEFAULT_REMINDER_MINUTES_BEFORE = 15;

function buildIcsValarm(minutesBefore: number, description: string): string[] {
  return [
    "BEGIN:VALARM",
    `TRIGGER:-PT${minutesBefore}M`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(description)}`,
    "END:VALARM",
  ];
}

export function buildBookingIcs(input: BuildBookingIcsInput): string | null {
  const safeTz = normalizeToSafeIanaTimeZone(input.timeZone);
  const start = wallClockInZoneToUtc(input.sessionDate, input.startTime, safeTz);
  if (!start) return null;

  let end: Date | null = null;
  if (input.endTime) {
    end = wallClockInZoneToUtc(input.sessionDate, input.endTime, safeTz);
  }
  if (!end) {
    const mins = durationMinutes(input.duration, input.startTime, input.endTime);
    if (mins != null) end = new Date(start.getTime() + mins * 60_000);
  }
  if (!end || end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 60 * 60_000);
  }

  const now = formatIcsUtc(new Date());
  const description = buildBookingIcsDescription({
    expertName: input.expertName,
    learnerName: input.learnerName,
    sessionLink: input.sessionLink,
    dashboardLink: input.dashboardLink,
  });
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Convene//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsUid(input.bookingId, input.appHost)}`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatIcsUtc(start)}`,
    `DTEND:${formatIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(input.sessionLink)}`,
    `URL:${escapeIcsText(input.sessionLink)}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    ...buildIcsValarm(
      DEFAULT_REMINDER_MINUTES_BEFORE,
      `Convene session starting in ${DEFAULT_REMINDER_MINUTES_BEFORE} minutes`,
    ),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function bookingCalendarUrl(bookingId: string, appBaseUrl: string): string {
  const base = appBaseUrl.replace(/\/$/, "");
  return `${base}/api/calendar/booking/${bookingId}.ics`;
}

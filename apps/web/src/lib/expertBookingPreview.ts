import {
  formatTimeSlotLabel12h,
  formatTimeSlotLabel12hFourDigit,
  minutesToTimeString,
  normalizeWeeklySchedule,
  timeToMinutes,
  type WeekdayKey,
  type WeeklyScheduleState,
  type WeeklySlot,
  WEEKDAY_KEYS,
} from "@/components/expert/weeklyAvailabilityUtils";
import { intervalStringToMinutes } from "@/lib/expert-registration";

const SLOT_STEP_MIN = 15;
const DEFAULT_MIN_BOOKING = 30;
/** Upper bound per calendar day so payloads stay bounded (≈32h of 15‑minute starts). */
const MAX_PREVIEW_SLOTS_PER_DAY = 128;
const DEFAULT_MAX_NOTICE_MIN = 14 * 24 * 60;
const LONG_RANGE_DAYS = 21;

/** Invalid `users.time_zone` values make `Intl` throw RangeError and can crash API routes. */
function normalizeToSafeIanaTimeZone(input: string | null | undefined): string {
  const z = (input ?? "UTC").trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: z }).format(new Date(0));
    return z;
  } catch {
    return "UTC";
  }
}

export type BookingWeekPreviewDay = {
  weekdayShort: string;
  dayNum: number;
  slots: string[];
  /** Parallel to `slots` — UTC ms for each displayed preview chip (booking modal anchor). */
  slotStartsUtcMs: number[];
  moreCount: number;
};

export type BookingWeekPreview = {
  days: BookingWeekPreviewDay[];
  monthYearLabel: string;
  timeZoneNote: string;
  /** e.g. "Pacific Time" — for "Times displayed in …" without duplicate dates. */
  timezoneNameLabel: string;
  /** e.g. "Apr 1, 2026" — first day of the preview strip in the expert's time zone. */
  asOfDateLabel: string;
};

export type ExpertAvailabilityForPreview = {
  weekly_schedule: unknown;
  availability_overrides: unknown;
  calendar_paused?: boolean | null;
  minimum_notice?: unknown | null;
  maximum_notice?: unknown | null;
  minimum_booking?: unknown | null;
  buffer_time?: number | null;
};

export function parseMinBookingMinutes(v: unknown): number {
  if (v == null || v === "") return DEFAULT_MIN_BOOKING;
  const s = String(v);
  const m1 = s.match(/^(\d+)\s*minutes?$/i);
  if (m1) return Math.max(1, Number(m1[1]));
  const m2 = s.match(/^(\d+):(\d{2}):(\d{2})/);
  if (m2) return Math.max(1, Number(m2[1]) * 60 + Number(m2[2]));
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_MIN_BOOKING;
}

function zonedParts(tUtc: number, ianaZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(tUtc));
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    h: Number(map.hour),
    mi: Number(map.minute),
  };
}

/** Wall clock in `ianaZone` at (y-m-d H:Mi) → UTC ms (first match via binary search). */
function zonedWallTimeToUtcMs(
  y: number,
  m: number,
  d: number,
  hour: number,
  minute: number,
  ianaZone: string,
): number {
  const key = (Y: number, M: number, D: number, H: number, Mi: number) =>
    Y * 1e9 + M * 1e7 + D * 1e5 + H * 100 + Mi;
  const targetKey = key(y, m, d, hour, minute);
  let lo = Date.UTC(y, m - 1, d) - 48 * 3600000;
  let hi = Date.UTC(y, m - 1, d) + 48 * 3600000;
  for (let iter = 0; iter < 60; iter++) {
    const mid = Math.floor((lo + hi) / 2);
    const p = zonedParts(mid, ianaZone);
    const k = key(p.y, p.m, p.d, p.h, p.mi);
    if (k < targetKey) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function addCalendarDaysGregorian(y: number, m: number, d: number, delta: number) {
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function weekdayKeyAtNoon(y: number, m: number, d: number, tz: string): WeekdayKey {
  const utcMs = zonedWallTimeToUtcMs(y, m, d, 12, 0, tz);
  const w = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(new Date(utcMs));
  const map: Record<string, WeekdayKey> = {
    Monday: "monday",
    Tuesday: "tuesday",
    Wednesday: "wednesday",
    Thursday: "thursday",
    Friday: "friday",
    Saturday: "saturday",
    Sunday: "sunday",
  };
  return map[w] ?? "monday";
}

function normalizeOverrides(raw: unknown): Map<string, WeeklySlot[]> {
  const out = new Map<string, WeeklySlot[]>();
  if (!Array.isArray(raw)) return out;
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const date = String((row as { date?: unknown }).date ?? "").slice(0, 10);
    const slots = (row as { slots?: unknown }).slots;
    if (!date || !Array.isArray(slots)) continue;
    out.set(
      date,
      slots
        .filter((x): x is { start?: unknown; end?: unknown } => Boolean(x) && typeof x === "object")
        .map((x) => ({ start: String(x.start ?? "").trim(), end: String(x.end ?? "").trim() }))
        .filter((x) => x.start && x.end),
    );
  }
  return out;
}

function ymdKey(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function slotsForCalendarDay(
  y: number,
  m: number,
  d: number,
  weekly: WeeklyScheduleState,
  overrides: Map<string, WeeklySlot[]>,
  tz: string,
): WeeklySlot[] {
  const key = ymdKey(y, m, d);
  const o = overrides.get(key);
  if (o && o.length) return o;
  const wd = weekdayKeyAtNoon(y, m, d, tz);
  return weekly[wd] ?? [];
}

function* slotStartUtcMsForDay(
  y: number,
  m: number,
  d: number,
  daySlots: WeeklySlot[],
  minBookingMin: number,
  bufferMin: number,
  tz: string,
): Generator<number> {
  for (const range of daySlots) {
    const startM = timeToMinutes(range.start);
    const endM = timeToMinutes(range.end);
    const capEnd = Math.max(startM, endM - bufferMin);
    for (let t = startM; t + minBookingMin <= capEnd; t += SLOT_STEP_MIN) {
      const h = Math.floor(t / 60);
      const mi = t % 60;
      yield zonedWallTimeToUtcMs(y, m, d, h, mi, tz);
    }
  }
}

export type PreviewComputation = {
  minNoticeMin: number;
  maxNoticeMin: number;
  minBookingMin: number;
  bufferMin: number;
  earliestUtc: number;
  latestUtc: number;
  weekly: WeeklyScheduleState;
  overrides: Map<string, WeeklySlot[]>;
  tz: string;
};

export function buildPreviewComputation(
  row: ExpertAvailabilityForPreview | null | undefined,
  expertTimeZone: string | null | undefined,
  now: Date = new Date(),
): PreviewComputation | null {
  if (!row) return null;
  if (row.calendar_paused) return null;
  const tz = normalizeToSafeIanaTimeZone(expertTimeZone);
  const weekly = normalizeWeeklySchedule(row.weekly_schedule);
  const overrides = normalizeOverrides(row.availability_overrides);
  const minNoticeMin = Math.max(0, intervalStringToMinutes(row.minimum_notice) ?? 0);
  const maxNoticeMin = Math.max(
    minNoticeMin,
    intervalStringToMinutes(row.maximum_notice) ?? DEFAULT_MAX_NOTICE_MIN,
  );
  const minBookingMin = parseMinBookingMinutes(row.minimum_booking);
  const bufferMin = Math.max(0, Number(row.buffer_time ?? 0) || 0);
  const nowMs = now.getTime();
  const earliestUtc = nowMs + minNoticeMin * 60000;
  const latestUtc = nowMs + maxNoticeMin * 60000;
  return {
    minNoticeMin,
    maxNoticeMin,
    minBookingMin,
    bufferMin,
    earliestUtc,
    latestUtc,
    weekly,
    overrides,
    tz,
  };
}

/** All bookable slot starts in `[earliestUtc, latestUtc]`, chronological, up to LONG_RANGE_DAYS. */
function* iterateBookableSlotStarts(comp: PreviewComputation, now: Date): Generator<number> {
  const { y: y0, m: m0, d: d0 } = zonedParts(now.getTime(), comp.tz);
  for (let dayOff = 0; dayOff < LONG_RANGE_DAYS; dayOff += 1) {
    const { y, m, d } = addCalendarDaysGregorian(y0, m0, d0, dayOff);
    const daySlots = slotsForCalendarDay(y, m, d, comp.weekly, comp.overrides, comp.tz);
    if (!daySlots.length) continue;
    for (const utcMs of slotStartUtcMsForDay(
      y,
      m,
      d,
      daySlots,
      comp.minBookingMin,
      comp.bufferMin,
      comp.tz,
    )) {
      if (utcMs < comp.earliestUtc) continue;
      if (utcMs > comp.latestUtc) return;
      yield utcMs;
    }
  }
}

/** Bible: "Available now" = at least one bookable session start within the next hour. */
export const AVAILABLE_NOW_WINDOW_MS = 60 * 60 * 1000;

export type AvailableNowResult = {
  availableNow: boolean;
  /** ISO timestamp for UI ("until 3:45pm"); end of the soonest qualifying slot. */
  availableUntil: string | null;
};

/**
 * True when the expert's schedule yields a bookable start within the next hour,
 * respecting minimum notice, calendar pause, and weekly/override windows.
 * Does not subtract existing bookings (same model as next_bookable_slots preview).
 */
export function computeAvailableNow(
  row: ExpertAvailabilityForPreview | null | undefined,
  expertTimeZone: string | null | undefined,
  now: Date = new Date(),
): AvailableNowResult {
  const comp = buildPreviewComputation(row, expertTimeZone, now);
  if (!comp) return { availableNow: false, availableUntil: null };

  const next = findNextSlotStartUtc(comp, now);
  if (!next) return { availableNow: false, availableUntil: null };

  const nowMs = now.getTime();
  const windowEndMs = nowMs + AVAILABLE_NOW_WINDOW_MS;
  if (next.utcMs > windowEndMs) {
    return { availableNow: false, availableUntil: null };
  }

  const slotEndMs = next.utcMs + comp.minBookingMin * 60000;
  return {
    availableNow: true,
    availableUntil: new Date(slotEndMs).toISOString(),
  };
}

/** Earliest bookable slot start (UTC ms), or null. Scans up to LONG_RANGE_DAYS ahead. */
export function findNextSlotStartUtc(
  comp: PreviewComputation,
  now: Date = new Date(),
): { utcMs: number; y: number; m: number; d: number; startMinuteOfDay: number } | null {
  for (const utcMs of iterateBookableSlotStarts(comp, now)) {
    const p = zonedParts(utcMs, comp.tz);
    return { utcMs, y: p.y, m: p.m, d: p.d, startMinuteOfDay: p.h * 60 + p.mi };
  }
  return null;
}

export type NextBookableSlot = {
  startUtcMs: number;
  endUtcMs: number;
  /** e.g. "Wed, Apr 1st" in the expert's time zone. */
  displayDate: string;
  /** e.g. "9:30am-10am" in the expert's time zone. */
  displayTime: string;
};

function dayWithOrdinal(day: number): string {
  const j = day % 10;
  const k = day % 100;
  if (k >= 11 && k <= 13) return `${day}th`;
  if (j === 1) return `${day}st`;
  if (j === 2) return `${day}nd`;
  if (j === 3) return `${day}rd`;
  return `${day}th`;
}

function formatSearchSlotParts(startUtcMs: number, endUtcMs: number, tz: string): {
  displayDate: string;
  displayTime: string;
} {
  const when = new Date(startUtcMs);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(when);
  const month = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short" }).format(when);
  const startP = zonedParts(startUtcMs, tz);
  const endP = zonedParts(endUtcMs, tz);
  const displayDate = `${weekday}, ${month} ${dayWithOrdinal(startP.d)}`;
  const startStr = formatTimeSlotLabel12h(minutesToTimeString(startP.h * 60 + startP.mi));
  const endStr = formatTimeSlotLabel12h(minutesToTimeString(endP.h * 60 + endP.mi));
  const lowerAmPm = (s: string) => s.replace(/\s?(AM|PM)\b/g, (_, x: string) => (x === "AM" ? "am" : "pm"));
  const t1 = lowerAmPm(startStr).replace(/\s+/g, "");
  const t2 = lowerAmPm(endStr).replace(/\s+/g, "");
  const displayTime = `${t1}-${t2}`;
  return { displayDate, displayTime };
}

/**
 * Next `count` bookable starts, non-overlapping (session length + buffer between starts).
 */
export function computeNextBookableSlots(
  row: ExpertAvailabilityForPreview | null | undefined,
  expertTimeZone: string | null | undefined,
  count: number,
  now: Date = new Date(),
): NextBookableSlot[] {
  const comp = buildPreviewComputation(row, expertTimeZone, now);
  if (!comp || count <= 0) return [];
  const minBookMs = comp.minBookingMin * 60000;
  const bufferMs = comp.bufferMin * 60000;
  const out: NextBookableSlot[] = [];
  let minNextStart = comp.earliestUtc;
  for (const utcMs of iterateBookableSlotStarts(comp, now)) {
    if (utcMs < minNextStart) continue;
    const endUtc = utcMs + minBookMs;
    const { displayDate, displayTime } = formatSearchSlotParts(utcMs, endUtc, comp.tz);
    out.push({
      startUtcMs: utcMs,
      endUtcMs: endUtc,
      displayDate,
      displayTime,
    });
    if (out.length >= count) break;
    minNextStart = endUtc + bufferMs;
  }
  return out;
}

export function computeNextAvailableSummary(
  row: ExpertAvailabilityForPreview | null | undefined,
  expertTimeZone: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const comp = buildPreviewComputation(row, expertTimeZone, now);
  if (!comp) return null;
  const next = findNextSlotStartUtc(comp, now);
  if (!next) return null;
  const when = new Date(next.utcMs);
  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: comp.tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(when);
  const startStr = minutesToTimeString(next.startMinuteOfDay);
  const timePart = formatTimeSlotLabel12h(startStr);
  const tzShort =
    new Intl.DateTimeFormat("en-US", { timeZone: comp.tz, timeZoneName: "short" }).format(when);
  return `Next: ${datePart} · ${timePart} (${tzShort})`;
}

function previewMetaForTz(
  tz: string,
  y0: number,
  m0: number,
  d0: number,
): Pick<BookingWeekPreview, "monthYearLabel" | "timeZoneNote" | "timezoneNameLabel" | "asOfDateLabel"> {
  const midWeek = zonedWallTimeToUtcMs(y0, m0, d0, 12, 0, tz);
  const midDate = new Date(midWeek);
  const monthYearLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "long",
    year: "numeric",
  }).format(midDate);
  const timeZoneNote = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "longGeneric",
  }).format(midDate);
  const timezoneNameLabel =
    new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longGeneric" })
      .formatToParts(midDate)
      .find((p) => p.type === "timeZoneName")?.value ?? tz;
  const asOfDateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(zonedWallTimeToUtcMs(y0, m0, d0, 12, 0, tz)));
  return { monthYearLabel, timeZoneNote, timezoneNameLabel, asOfDateLabel };
}

function buildBookingWeekPreviewExpertTz(comp: PreviewComputation, now: Date): BookingWeekPreview {
  const { y: y0, m: m0, d: d0 } = zonedParts(now.getTime(), comp.tz);
  const days: BookingWeekPreviewDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const { y, m, d } = addCalendarDaysGregorian(y0, m0, d0, i);
    const wdShort = new Intl.DateTimeFormat("en-US", { timeZone: comp.tz, weekday: "short" }).format(
      zonedWallTimeToUtcMs(y, m, d, 12, 0, comp.tz),
    );
    const daySlots = slotsForCalendarDay(y, m, d, comp.weekly, comp.overrides, comp.tz);
    const labels: string[] = [];
    const slotStartsUtcMs: number[] = [];
    if (daySlots.length) {
      for (const utcMs of slotStartUtcMsForDay(
        y,
        m,
        d,
        daySlots,
        comp.minBookingMin,
        comp.bufferMin,
        comp.tz,
      )) {
        if (utcMs < comp.earliestUtc || utcMs > comp.latestUtc) continue;
        if (labels.length >= MAX_PREVIEW_SLOTS_PER_DAY) break;
        const p = zonedParts(utcMs, comp.tz);
        const startStr = minutesToTimeString(p.h * 60 + p.mi);
        const label = formatTimeSlotLabel12hFourDigit(startStr);
        labels.push(label);
        slotStartsUtcMs.push(utcMs);
      }
    }
    days.push({ weekdayShort: wdShort, dayNum: d, slots: labels, slotStartsUtcMs, moreCount: 0 });
  }
  const meta = previewMetaForTz(comp.tz, y0, m0, d0);
  return { days, ...meta };
}

/** Seven-day strip in `displayTz` (viewer) with slot labels in that zone; slot UTC instants unchanged. */
function buildBookingWeekPreviewDisplayTz(comp: PreviewComputation, displayTz: string, now: Date): BookingWeekPreview {
  const z = normalizeToSafeIanaTimeZone(displayTz);
  const { y: y0, m: m0, d: d0 } = zonedParts(now.getTime(), z);
  const dayMeta: { y: number; m: number; d: number; key: string }[] = [];
  for (let i = 0; i < 7; i += 1) {
    const { y, m, d } = addCalendarDaysGregorian(y0, m0, d0, i);
    dayMeta.push({ y, m, d, key: ymdKey(y, m, d) });
  }
  const byKey = new Map<string, number[]>();
  for (const { key } of dayMeta) byKey.set(key, []);

  for (const utcMs of iterateBookableSlotStarts(comp, now)) {
    const p = zonedParts(utcMs, z);
    const key = ymdKey(p.y, p.m, p.d);
    const arr = byKey.get(key);
    if (arr) arr.push(utcMs);
  }

  const days: BookingWeekPreviewDay[] = [];
  for (const { y, m, d, key } of dayMeta) {
    const sorted = (byKey.get(key) ?? []).sort((a, b) => a - b);
    const labels: string[] = [];
    const slotStartsUtcMs: number[] = [];
    for (const utcMs of sorted) {
      if (labels.length >= MAX_PREVIEW_SLOTS_PER_DAY) break;
      const p = zonedParts(utcMs, z);
      const startStr = minutesToTimeString(p.h * 60 + p.mi);
      const label = formatTimeSlotLabel12hFourDigit(startStr);
      labels.push(label);
      slotStartsUtcMs.push(utcMs);
    }
    const wdShort = new Intl.DateTimeFormat("en-US", { timeZone: z, weekday: "short" }).format(
      zonedWallTimeToUtcMs(y, m, d, 12, 0, z),
    );
    days.push({ weekdayShort: wdShort, dayNum: d, slots: labels, slotStartsUtcMs, moreCount: 0 });
  }

  const meta = previewMetaForTz(z, y0, m0, d0);
  return { days, ...meta };
}

export function computeBookingWeekPreview(
  row: ExpertAvailabilityForPreview | null | undefined,
  expertTimeZone: string | null | undefined,
  now: Date = new Date(),
  options?: { displayTimeZone?: string | null },
): BookingWeekPreview | null {
  const comp = buildPreviewComputation(row, expertTimeZone, now);
  if (!comp) return null;

  const raw = options?.displayTimeZone?.trim();
  if (raw) {
    const displayTz = normalizeToSafeIanaTimeZone(raw);
    if (displayTz !== comp.tz) {
      return buildBookingWeekPreviewDisplayTz(comp, displayTz, now);
    }
  }

  return buildBookingWeekPreviewExpertTz(comp, now);
}

export type BookingSlotChip = { utcMs: number; label: string };

/**
 * 15-minute bookable starts from `anchorUtcMs` through the rest of that calendar day (expert TZ).
 */
export function buildBookingSlotRowFromAnchor(
  row: ExpertAvailabilityForPreview | null | undefined,
  expertTimeZone: string | null | undefined,
  anchorUtcMs: number,
  now: Date = new Date(),
  options?: { maxCount?: number; labelTimeZone?: string | null },
): BookingSlotChip[] {
  const maxCount = options?.maxCount ?? 36;
  const comp = buildPreviewComputation(row, expertTimeZone, now);
  if (!comp) return [];
  const { y, m, d } = zonedParts(anchorUtcMs, comp.tz);
  const daySlots = slotsForCalendarDay(y, m, d, comp.weekly, comp.overrides, comp.tz);
  const labelTz =
    options?.labelTimeZone != null && String(options.labelTimeZone).trim() !== ""
      ? normalizeToSafeIanaTimeZone(options.labelTimeZone)
      : comp.tz;
  const out: BookingSlotChip[] = [];
  for (const utcMs of slotStartUtcMsForDay(y, m, d, daySlots, comp.minBookingMin, comp.bufferMin, comp.tz)) {
    if (utcMs < comp.earliestUtc || utcMs > comp.latestUtc) continue;
    if (utcMs < anchorUtcMs) continue;
    if (out.length >= maxCount) break;
    const p = zonedParts(utcMs, labelTz);
    const startStr = minutesToTimeString(p.h * 60 + p.mi);
    out.push({ utcMs, label: formatTimeSlotLabel12hFourDigit(startStr) });
  }
  return out;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Same calendar day in `tz` only; otherwise `null` (overnight not supported yet). */
export function bookingTimesForPg(
  startUtcMs: number,
  endUtcMs: number,
  tz: string,
): { sessionDate: string; startTime: string; endTime: string } | null {
  const z = normalizeToSafeIanaTimeZone(tz);
  const sp = zonedParts(startUtcMs, z);
  const ep = zonedParts(endUtcMs, z);
  const sd = ymdKey(sp.y, sp.m, sp.d);
  const ed = ymdKey(ep.y, ep.m, ep.d);
  if (sd !== ed) return null;
  return {
    sessionDate: sd,
    startTime: `${pad2(sp.h)}:${pad2(sp.mi)}:00`,
    endTime: `${pad2(ep.h)}:${pad2(ep.mi)}:00`,
  };
}

/** True if weekly schedule or overrides define any window. */
export function hasWeeklyAvailabilityConfigured(row: ExpertAvailabilityForPreview | null | undefined): boolean {
  if (!row || row.calendar_paused) return false;
  const weekly = normalizeWeeklySchedule(row.weekly_schedule);
  if (WEEKDAY_KEYS.some((k) => (weekly[k] ?? []).length > 0)) return true;
  const ov = normalizeOverrides(row.availability_overrides);
  for (const slots of ov.values()) {
    if (slots.length) return true;
  }
  return false;
}

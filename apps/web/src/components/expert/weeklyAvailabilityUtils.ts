/** Day keys stored in weekly_schedule JSON (lowercase). */
export const WEEKDAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export type WeeklySlot = { start: string; end: string };

export type WeeklyScheduleState = Record<WeekdayKey, WeeklySlot[]>;

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

/** Parse "HH:MM" or "HH:MM:SS" to minutes from midnight. */
export function timeToMinutes(t: string): number {
  const p = t.trim().split(":");
  const h = Number(p[0] ?? 0);
  const m = Number(p[1] ?? 0);
  const s = Number(p[2] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m + Math.round(s / 60);
}

export function minutesToTimeString(total: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.floor(total)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** 15-minute step options from 00:00 to 23:45 */
export function buildTimeOptions(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

/** Display label: "9:00 AM", "9:15 AM", "12:00 PM" (24h HH:MM → 12h, minutes always shown). */
export function formatTimeSlotLabel12h(hhmm: string): string {
  const minsRaw = timeToMinutes(hhmm.trim().slice(0, 8));
  if (!Number.isFinite(minsRaw)) return hhmm;
  const mins = ((minsRaw % (24 * 60)) + 24 * 60) % (24 * 60);
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 < 12 ? "AM" : "PM";
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Always includes minutes; lowercase am/pm, no space (e.g. "10:00am", "9:30am"). */
export function formatTimeSlotLabel12hFourDigit(hhmm: string): string {
  const minsRaw = timeToMinutes(hhmm.trim().slice(0, 8));
  if (!Number.isFinite(minsRaw)) return hhmm;
  const mins = ((minsRaw % (24 * 60)) + 24 * 60) % (24 * 60);
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 < 12 ? "am" : "pm";
  return `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

/** Ensure all weekdays exist; drop invalid slots. */
export function normalizeWeeklySchedule(
  input: unknown,
): WeeklyScheduleState {
  const out: WeeklyScheduleState = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
  if (!input || typeof input !== "object") return out;
  for (const k of WEEKDAY_KEYS) {
    const slots = (input as Record<string, unknown>)[k];
    if (!Array.isArray(slots)) continue;
    out[k] = slots
      .filter((x): x is { start?: unknown; end?: unknown } => Boolean(x) && typeof x === "object")
      .map((x) => ({ start: String(x.start ?? "").trim(), end: String(x.end ?? "").trim() }))
      .filter((x) => x.start && x.end);
  }
  return out;
}

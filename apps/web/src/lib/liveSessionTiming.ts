import { sessionWallClockInstant } from "@/lib/sessionWallClock";

/** Bible: session extensions bill in this increment. */
export const SESSION_EXTENSION_BLOCK_MINUTES = 15;

/**
 * Wall-clock end of the session. `bookings.end_time` is the source of truth — it is bumped when an
 * extension payment finalizes (`extensions` counts how many paid blocks; do not add blocks again here).
 */
export function effectiveSessionEndInstant(
  sessionDate: string | null | undefined,
  endTime: string | null | undefined,
  _extensionsCount?: unknown,
): Date | null {
  void _extensionsCount;
  return sessionWallClockInstant(String(sessionDate ?? ""), endTime);
}

/** Minutes until end (`0` once past); `null` if end time unparsable. */
export function minutesRemainingEffective(
  sessionDate: string | null | undefined,
  endTime: string | null | undefined,
  extensionsCount?: unknown,
  nowMs: number = Date.now(),
): number | null {
  const end = effectiveSessionEndInstant(sessionDate, endTime, extensionsCount);
  if (!end) return null;
  const diffMs = end.getTime() - nowMs;
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / 60_000);
}

export function hasEffectiveSessionEnded(
  sessionDate: string | null | undefined,
  endTime: string | null | undefined,
  extensionsCount?: unknown,
  nowMs: number = Date.now(),
): boolean {
  const mins = minutesRemainingEffective(sessionDate, endTime, extensionsCount, nowMs);
  return mins !== null && mins <= 0;
}

/** `HH:mm:ss` in the same wall-clock regime as `Date` parsing for `YYYY-MM-DDTHH:mm:ss`. */
export function wallClockTimeOfDay(date: Date): string {
  const h = date.getHours();
  const mi = date.getMinutes();
  const sec = date.getSeconds();
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

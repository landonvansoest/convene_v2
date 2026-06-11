/** Normalize to `HH:MM:SS` for Postgres `time` columns. */
export function normalizeWallTimeForPg(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const sec = m[3] != null ? Number(m[3]) : 0;
  if (![h, mi, sec].every((n) => Number.isFinite(n))) return null;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Minutes since midnight on the session wall clock (supports seconds). */
function timeStrToMinutes(t: string): number | null {
  const s = String(t).trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const sec = m[3] != null ? Number(m[3]) : 0;
  if (![h, mi, sec].every((n) => Number.isFinite(n))) return null;
  return h * 60 + mi + sec / 60;
}

/** Duration in minutes for same-calendar-day session (end after start). */
export function durationMinutesBetweenWallTimes(startHm: string, endHm: string): number | null {
  const sm = timeStrToMinutes(startHm);
  const em = timeStrToMinutes(endHm);
  if (sm == null || em == null || em <= sm) return null;
  return Math.round(em - sm);
}

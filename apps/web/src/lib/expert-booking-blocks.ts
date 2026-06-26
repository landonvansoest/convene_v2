import type { SupabaseClient } from "@supabase/supabase-js";

/** Wall-clock session block on a calendar day (expert time zone). */
export type ExpertBlockingInterval = {
  sessionDate: string;
  startSec: number;
  endSec: number;
};

export function timeStrToSec(t: string): number {
  const parts = String(t).trim().split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  const s = Number(parts[2] ?? 0);
  if (![h, m, s].every((n) => Number.isFinite(n))) return 0;
  return h * 3600 + m * 60 + s;
}

export function wallClockIntervalsOverlap(
  dateA: string,
  startA: number,
  endA: number,
  dateB: string,
  startB: number,
  endB: number,
): boolean {
  if (dateA !== dateB) return false;
  if (endA <= startA || endB <= startB) return false;
  return startA < endB && startB < endA;
}

/** True when `[startSec, endSec)` on `sessionDate` intersects any blocking interval. */
export function proposedSessionOverlapsBlockingIntervals(
  sessionDate: string,
  startSec: number,
  endSec: number,
  intervals: ExpertBlockingInterval[],
): boolean {
  if (endSec <= startSec) return true;
  for (const iv of intervals) {
    if (wallClockIntervalsOverlap(sessionDate, startSec, endSec, iv.sessionDate, iv.startSec, iv.endSec)) {
      return true;
    }
  }
  return false;
}

function rowToBlockingInterval(row: {
  session_date: unknown;
  start_time: unknown;
  end_time: unknown;
  payment_status: unknown;
}): ExpertBlockingInterval | null {
  const ps = String(row.payment_status ?? "").toLowerCase();
  if (ps === "failed") return null;
  const startSec = timeStrToSec(String(row.start_time ?? ""));
  const endSec = timeStrToSec(String(row.end_time ?? ""));
  if (endSec <= startSec) return null;
  const sessionDate = String(row.session_date ?? "").slice(0, 10);
  if (!sessionDate) return null;
  return { sessionDate, startSec, endSec };
}

/**
 * Non-cancelled bookings that hold the expert's calendar (pending / awaiting_expert / paid).
 */
export async function fetchExpertBlockingIntervals(
  admin: SupabaseClient,
  expertUserId: string,
  sessionDates: string[],
): Promise<ExpertBlockingInterval[]> {
  const dates = [...new Set(sessionDates.filter(Boolean))];
  if (!dates.length) return [];

  const { data: rows, error } = await admin
    .from("bookings")
    .select("session_date, start_time, end_time, payment_status")
    .eq("expert_user_id", expertUserId)
    .in("session_date", dates)
    .neq("status", "cancelled");

  if (error || !rows?.length) return [];

  const out: ExpertBlockingInterval[] = [];
  for (const row of rows) {
    const iv = rowToBlockingInterval(row);
    if (iv) out.push(iv);
  }
  return out;
}

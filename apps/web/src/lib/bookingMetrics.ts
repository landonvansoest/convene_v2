import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeDependabilityBreakdown,
  type BookingDependabilityInput,
  type RescheduleMessageMeta,
} from "@/lib/dependability-breakdown";
import { bookingPaymentIsSettled, hasSessionEndedByWallClock } from "@/lib/sessionWallClock";

/** Minimal booking row shape for counting completed sessions and averaging dependability. */
export type BookingMetricsRow = {
  status?: string | null;
  payment_status?: unknown;
  session_date?: string | null;
  end_time?: string | null;
  expert_dependability?: number | null;
  learner_dependability?: number | null;
};

/** Fields required to run `computeDependabilityBreakdown` plus payment + reschedule link. */
export type BookingForMetrics = BookingDependabilityInput & {
  payment_status?: unknown;
  reschedule_request_id?: string | null;
};

const CANCELLED = new Set(["cancelled", "canceled"]);

function isNoShowLikeStatus(statusLower: string): boolean {
  return statusLower.includes("no_show") || statusLower.includes("no-show") || statusLower.includes("noshow");
}

/**
 * Paid session counts as “completed” for public stats once it reached `complete` in the DB or
 * the scheduled window has ended (excluding cancelled / no-show style statuses).
 */
export function isCountableCompletedBooking(row: BookingMetricsRow): boolean {
  if (!bookingPaymentIsSettled(row.payment_status)) return false;
  const st = String(row.status ?? "").toLowerCase();
  if (CANCELLED.has(st)) return false;
  if (isNoShowLikeStatus(st)) return false;
  if (st === "complete") return true;
  const sessionDate = String(row.session_date ?? "");
  if (!sessionDate) return false;
  return hasSessionEndedByWallClock(sessionDate, row.end_time);
}

function roundAvg(vals: number[]): number | null {
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, x) => a + x, 0) / vals.length);
}

function rescheduleForBooking(
  b: BookingForMetrics,
  rescheduleByMessageId: Map<string, RescheduleMessageMeta>,
): RescheduleMessageMeta {
  const rid = b.reschedule_request_id ? String(b.reschedule_request_id) : "";
  if (!rid) return null;
  return rescheduleByMessageId.get(rid) ?? null;
}

/**
 * Loads message rows referenced by `bookings.reschedule_request_id` (same as Session Details API).
 */
export async function fetchRescheduleMessagesForBookings(
  admin: SupabaseClient,
  bookings: Array<{ reschedule_request_id?: string | null }>,
): Promise<Map<string, RescheduleMessageMeta>> {
  const ids = [
    ...new Set(
      bookings
        .map((row) => (row.reschedule_request_id ? String(row.reschedule_request_id) : ""))
        .filter(Boolean),
    ),
  ];
  const out = new Map<string, RescheduleMessageMeta>();
  if (!ids.length) return out;

  const { data, error } = await admin
    .from("messages")
    .select("message_id, created_at, sender_id")
    .in("message_id", ids);
  if (error) return out;
  for (const row of data ?? []) {
    const id = row.message_id ? String(row.message_id) : "";
    if (!id || !row.created_at || !row.sender_id) continue;
    out.set(id, { created_at: String(row.created_at), sender_id: String(row.sender_id) });
  }
  return out;
}

/**
 * Average dependability uses stored `bookings.expert_dependability` when set; otherwise computes the
 * same session score as Session Details (`computeDependabilityBreakdown`).
 */
export function summarizeExpertBookingMetrics(rows: BookingForMetrics[], rescheduleByMessageId: Map<string, RescheduleMessageMeta>): {
  completedSessionCount: number;
  avgExpertDependability: number | null;
} {
  const done = rows.filter(isCountableCompletedBooking);
  const scores: number[] = [];
  for (const b of done) {
    const rm = rescheduleForBooking(b, rescheduleByMessageId);
    const br = computeDependabilityBreakdown(b, b.expert_user_id, rm);
    scores.push(br.viewerSessionScore);
  }
  return {
    completedSessionCount: done.length,
    avgExpertDependability: roundAvg(scores),
  };
}

export function summarizeLearnerBookingMetrics(
  rows: BookingForMetrics[],
  rescheduleByMessageId: Map<string, RescheduleMessageMeta>,
): {
  completedSessionCount: number;
  avgLearnerDependability: number | null;
} {
  const done = rows.filter(isCountableCompletedBooking);
  const scores: number[] = [];
  for (const b of done) {
    const rm = rescheduleForBooking(b, rescheduleByMessageId);
    const br = computeDependabilityBreakdown(b, b.learner_user_id, rm);
    scores.push(br.viewerSessionScore);
  }
  return {
    completedSessionCount: done.length,
    avgLearnerDependability: roundAvg(scores),
  };
}

export type BookingRowWithExpertId = BookingForMetrics & { expert_user_id?: string | null };

/** Columns required to count completed sessions and compute dependability (same rules as Session Details). */
export const BOOKING_SELECT_FOR_METRICS =
  "booking_id, expert_user_id, learner_user_id, session_date, start_time, end_time, status, payment_status, cancelled_at, cancelled_by, learner_joined, expert_joined, learner_delay, expert_delay, expert_dependability, learner_dependability, extensions, extensions_amount, reschedule_request_id" as const;

export function bucketBookingsByExpertUserId(rows: BookingRowWithExpertId[]): Map<string, BookingForMetrics[]> {
  const m = new Map<string, BookingForMetrics[]>();
  for (const b of rows) {
    const id = String(b.expert_user_id ?? "");
    if (!id) continue;
    const arr = m.get(id) ?? [];
    arr.push(b);
    m.set(id, arr);
  }
  return m;
}

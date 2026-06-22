import type { createAdminClient } from "@/lib/supabase/admin";
import {
  computeDependabilityBreakdown,
  type BookingDependabilityInput,
  type RescheduleMessageMeta,
} from "@/lib/dependability-breakdown";
import { bookingPaymentIsSettled, hasSessionEndedByWallClock, sessionWallClockInstant } from "@/lib/sessionWallClock";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Bible §"Dependability Rating" — single write path for per-booking scores.
 *
 * Recomputes both the learner and expert per-booking dependability scores
 * from the current booking signals (status, cancellation, joins, reschedule
 * message) and writes them to bookings.{learner,expert}_dependability. The
 * Postgres trigger in migration 043 then rolls those into the user-level
 * average ratings automatically.
 *
 * Call this whenever an event happens that could change a score:
 *   - cancellation (status → cancelled, cancelled_at, cancelled_by set)
 *   - reschedule suggestion sent (reschedule_request_id written)
 *   - learner / expert join recorded (learner_joined / expert_joined set,
 *     and learner_delay / expert_delay derived here when missing)
 *   - finalize cron transitions to complete / no_show / no_show_*
 *
 * Idempotent: writes the columns to the current computed value. Safe to call
 * multiple times for the same event.
 */
export async function persistBookingDependability(
  admin: Admin,
  bookingId: string,
): Promise<void> {
  const { data: b, error } = await admin
    .from("bookings")
    .select(
      "booking_id, session_date, start_time, end_time, status, cancelled_at, cancelled_by, learner_user_id, expert_user_id, learner_joined, expert_joined, learner_delay, expert_delay, learner_dependability, expert_dependability, extensions, extensions_amount, reschedule_request_id",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error || !b) return;

  const rescheduleMessage = await loadRescheduleMessage(
    admin,
    b.reschedule_request_id ? String(b.reschedule_request_id) : "",
  );

  // Derive missing learner_delay / expert_delay from the join timestamps
  // before scoring so the breakdown helper sees a consistent picture and the
  // delay columns reflect the truth for reporting.
  const derived = computeDelaysFromBooking(b);

  const learnerScore = computeSideScore(
    b,
    rescheduleMessage,
    String(b.learner_user_id),
    derived.learner_delay,
  );
  const expertScore = computeSideScore(
    b,
    rescheduleMessage,
    String(b.expert_user_id),
    derived.expert_delay,
  );

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let dirty = false;

  if (derived.learner_delay !== (b.learner_delay ?? null)) {
    payload.learner_delay = derived.learner_delay;
    dirty = true;
  }
  if (derived.expert_delay !== (b.expert_delay ?? null)) {
    payload.expert_delay = derived.expert_delay;
    dirty = true;
  }
  if (learnerScore !== (b.learner_dependability ?? null)) {
    payload.learner_dependability = learnerScore;
    dirty = true;
  }
  if (expertScore !== (b.expert_dependability ?? null)) {
    payload.expert_dependability = expertScore;
    dirty = true;
  }

  if (!dirty) return;

  await admin.from("bookings").update(payload).eq("booking_id", bookingId);
}

type StaleDependabilityRow = {
  booking_id?: string | null;
  session_date?: string | null;
  end_time?: string | null;
  status?: string | null;
  payment_status?: unknown;
};

/**
 * Best-effort: write per-booking scores for sessions whose wall-clock window ended
 * but the finalize cron has not yet flipped `status` off `upcoming` / `live`.
 */
export async function refreshStaleDependabilityForBookings(
  admin: Admin,
  rows: StaleDependabilityRow[],
): Promise<void> {
  for (const row of rows) {
    const bookingId = row.booking_id ? String(row.booking_id) : "";
    if (!bookingId) continue;
    if (!bookingPaymentIsSettled(row.payment_status)) continue;
    const st = String(row.status ?? "").toLowerCase();
    if (st !== "upcoming" && st !== "live") continue;
    if (!hasSessionEndedByWallClock(String(row.session_date ?? ""), row.end_time)) continue;
    try {
      await persistBookingDependability(admin, bookingId);
    } catch {
      // Cron will retry; profile load should not fail.
    }
  }
}

async function loadRescheduleMessage(
  admin: Admin,
  rescheduleRequestId: string,
): Promise<RescheduleMessageMeta> {
  if (!rescheduleRequestId) return null;
  const { data, error } = await admin
    .from("messages")
    .select("created_at, sender_id")
    .eq("message_id", rescheduleRequestId)
    .maybeSingle();
  if (error || !data?.created_at || !data?.sender_id) return null;
  return { created_at: String(data.created_at), sender_id: String(data.sender_id) };
}

type BookingRow = {
  session_date: unknown;
  start_time: unknown;
  end_time?: unknown;
  status?: unknown;
  cancelled_at?: unknown;
  cancelled_by?: unknown;
  learner_user_id: unknown;
  expert_user_id: unknown;
  learner_joined?: unknown;
  expert_joined?: unknown;
  learner_delay?: unknown;
  expert_delay?: unknown;
  learner_dependability?: unknown;
  expert_dependability?: unknown;
  extensions?: unknown;
  extensions_amount?: unknown;
  reschedule_request_id?: unknown;
};

function toInput(b: BookingRow): BookingDependabilityInput {
  return {
    session_date: String(b.session_date ?? ""),
    start_time: (b.start_time as string | null | undefined) ?? null,
    end_time: (b.end_time as string | null | undefined) ?? null,
    status: (b.status as string | null | undefined) ?? null,
    cancelled_at: (b.cancelled_at as string | null | undefined) ?? null,
    cancelled_by: (b.cancelled_by as string | null | undefined) ?? null,
    learner_user_id: String(b.learner_user_id ?? ""),
    expert_user_id: String(b.expert_user_id ?? ""),
    learner_joined: (b.learner_joined as string | null | undefined) ?? null,
    expert_joined: (b.expert_joined as string | null | undefined) ?? null,
    learner_delay: (b.learner_delay as number | null | undefined) ?? null,
    expert_delay: (b.expert_delay as number | null | undefined) ?? null,
    learner_dependability: null, // ignore stored, compute fresh
    expert_dependability: null,
    extensions: (b.extensions as number | null | undefined) ?? null,
    extensions_amount: (b.extensions_amount as number | string | null | undefined) ?? null,
    reschedule_request_id: (b.reschedule_request_id as string | null | undefined) ?? null,
  };
}

function computeSideScore(
  b: BookingRow,
  rescheduleMessage: RescheduleMessageMeta,
  viewerUserId: string,
  derivedDelay: number | null,
): number {
  const input = toInput(b);
  if (viewerUserId === input.learner_user_id) {
    input.learner_delay = derivedDelay;
  } else if (viewerUserId === input.expert_user_id) {
    input.expert_delay = derivedDelay;
  }
  const breakdown = computeDependabilityBreakdown(input, viewerUserId, rescheduleMessage);
  return breakdown.sessionScore;
}

/**
 * Returns the canonical learner_delay / expert_delay (minutes past scheduled
 * start; null when on-time or not joined). Used both to persist into the
 * delay columns and to feed the breakdown helper. Always recomputes from join
 * timestamps so a corrected timestamp flows through to the score.
 */
function computeDelaysFromBooking(b: BookingRow): {
  learner_delay: number | null;
  expert_delay: number | null;
} {
  const start = sessionWallClockInstant(
    String(b.session_date ?? ""),
    (b.start_time as string | null | undefined) ?? null,
  );
  if (!start) {
    return {
      learner_delay: toIntOrNull(b.learner_delay),
      expert_delay: toIntOrNull(b.expert_delay),
    };
  }
  const startMs = start.getTime();
  return {
    learner_delay: lateMinutes(b.learner_joined, startMs),
    expert_delay: lateMinutes(b.expert_joined, startMs),
  };
}

function lateMinutes(joinedIso: unknown, scheduledStartMs: number): number | null {
  if (!joinedIso) return null;
  const t = Date.parse(String(joinedIso));
  if (!Number.isFinite(t)) return null;
  const delta = Math.floor((t - scheduledStartMs) / 60_000);
  if (delta <= 0) return 0;
  return delta;
}

function toIntOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

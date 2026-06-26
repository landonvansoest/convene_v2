import { sessionWallClockInstant } from "@/lib/sessionWallClock";

/** Grace period after scheduled start before a missing participant counts as no-show. */
export const NO_SHOW_GRACE_MS = 10 * 60 * 1000;

export type SessionEndStatus = "complete" | "no_show" | "no_show_expert" | "no_show_learner";

export type SessionEndBookingInput = {
  session_date?: string | null;
  start_time?: string | null;
  learner_joined?: string | null;
  expert_joined?: string | null;
  status?: string | null;
  cancelled_at?: string | null;
};

export function isTerminalSessionStatus(st: unknown): boolean {
  const s = String(st ?? "").toLowerCase();
  return (
    s === "complete" ||
    s === "no_show" ||
    s === "no_show_expert" ||
    s === "no_show_learner" ||
    s === "cancelled"
  );
}

function joinedAt(value: string | null | undefined): boolean {
  return Boolean(String(value ?? "").trim());
}

/**
 * Derive terminal booking status when a participant explicitly ends the session.
 * Both joined → complete. Otherwise no-show statuses apply only after 10 minutes past start.
 */
export function resolveManualSessionEndStatus(
  booking: SessionEndBookingInput,
  nowMs = Date.now(),
): { status: SessionEndStatus } | { error: string } {
  const st = String(booking.status ?? "").toLowerCase();
  if (booking.cancelled_at || st === "cancelled") {
    return { error: "Cancelled sessions cannot be ended" };
  }
  if (isTerminalSessionStatus(st) && st !== "cancelled") {
    return { error: "Session is already finalized" };
  }

  const learnerJoined = joinedAt(booking.learner_joined);
  const expertJoined = joinedAt(booking.expert_joined);

  if (learnerJoined && expertJoined) {
    return { status: "complete" };
  }

  const start = sessionWallClockInstant(String(booking.session_date ?? ""), booking.start_time);
  if (!start) return { error: "Invalid session schedule" };

  if (nowMs < start.getTime() + NO_SHOW_GRACE_MS) {
    return {
      error:
        "The session can be marked complete once both participants have joined, or as a no-show 10 minutes after the scheduled start time.",
    };
  }

  if (!learnerJoined && !expertJoined) return { status: "no_show" };
  if (!learnerJoined) return { status: "no_show_learner" };
  return { status: "no_show_expert" };
}

export function canEndSession(booking: SessionEndBookingInput | null | undefined, nowMs = Date.now()): boolean {
  if (!booking) return false;
  const result = resolveManualSessionEndStatus(booking, nowMs);
  return "status" in result;
}

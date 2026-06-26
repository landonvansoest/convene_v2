import {
  NO_SHOW_GRACE_MS,
  type SessionEndBookingInput,
  type SessionEndStatus,
  isTerminalSessionStatus,
} from "@/lib/resolveManualSessionEndStatus";
import { sessionWallClockInstant } from "@/lib/sessionWallClock";

function joinedAt(value: string | null | undefined): boolean {
  return Boolean(String(value ?? "").trim());
}

/**
 * One-sided no-show report from the waiting room (reporter joined; partner has not).
 */
export function resolveWaitingRoomNoShowReport(
  booking: SessionEndBookingInput,
  reporterUserId: string,
  learnerUserId: string,
  expertUserId: string,
  nowMs = Date.now(),
): { status: SessionEndStatus } | { error: string } {
  const st = String(booking.status ?? "").toLowerCase();
  if (booking.cancelled_at || st === "cancelled") {
    return { error: "Cancelled sessions cannot be reported as a no-show." };
  }
  if (isTerminalSessionStatus(st) && st !== "cancelled") {
    return { error: "Session is already finalized." };
  }

  const isLearner = reporterUserId === learnerUserId;
  const isExpert = reporterUserId === expertUserId;
  if (!isLearner && !isExpert) return { error: "Forbidden" };

  const learnerJoined = joinedAt(booking.learner_joined);
  const expertJoined = joinedAt(booking.expert_joined);

  if (isLearner && !learnerJoined) {
    return { error: "You must be in the session to report a no-show." };
  }
  if (isExpert && !expertJoined) {
    return { error: "You must be in the session to report a no-show." };
  }
  if (isLearner && expertJoined) {
    return { error: "Your expert has already joined." };
  }
  if (isExpert && learnerJoined) {
    return { error: "Your learner has already joined." };
  }

  const start = sessionWallClockInstant(String(booking.session_date ?? ""), booking.start_time);
  if (!start) return { error: "Invalid session schedule" };

  if (nowMs < start.getTime() + NO_SHOW_GRACE_MS) {
    return {
      error: "No-show can be reported 10 minutes after the scheduled start time.",
    };
  }

  if (isLearner) return { status: "no_show_expert" };
  return { status: "no_show_learner" };
}

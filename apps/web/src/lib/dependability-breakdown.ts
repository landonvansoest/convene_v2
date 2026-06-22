import { sessionWallClockInstant, hasSessionEndedByWallClock } from "@/lib/sessionWallClock";

export type DependabilityLineItem = {
  code: string;
  label: string;
  deduction: number;
  /** Short phrase after "−N points for …" in the session details dialog. */
  publicPhrase: string;
};

export type DependabilityBreakdownResult = {
  viewerUserId: string;
  viewerRole: "learner" | "expert";
  scheduledStartMs: number | null;
  scheduledStartLabel: string | null;
  joinTimeIso: string | null;
  joinTimeLabel: string | null;
  minutesLate: number | null;
  cancelledAtIso: string | null;
  cancelledByUserId: string | null;
  cancellationSummary: string | null;
  rescheduleMessageAtIso: string | null;
  rescheduleProposerUserId: string | null;
  rescheduleSummary: string | null;
  extensionsCount: number;
  extensionsAmountUsd: number;
  lineItems: DependabilityLineItem[];
  totalDeduction: number;
  sessionScore: number;
  /** From `bookings.expert_dependability` / `learner_dependability` when set. */
  storedSessionScore: number | null;
  /** Score shown for the viewer: stored row value when present, otherwise computed session score. */
  viewerSessionScore: number;
  notes: string[];
};

function formatLocalDateTime(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function hoursBeforeScheduledStart(scheduledStartMs: number, actionMs: number): number {
  return (scheduledStartMs - actionMs) / 3_600_000;
}

/** Bible: cancellation deductions by how far before scheduled start the cancel happened. */
export function cancellationDeductionPoints(hoursBefore: number): number {
  if (hoursBefore > 24) return 50;
  if (hoursBefore > 12) return 60;
  if (hoursBefore > 6) return 70;
  if (hoursBefore > 2) return 80;
  if (hoursBefore > 1) return 90;
  if (hoursBefore > 0) return 95;
  return 95;
}

/** Bible: reschedule suggestion deductions. */
export function rescheduleSuggestionDeductionPoints(hoursBefore: number): number {
  if (hoursBefore > 24) return 10;
  if (hoursBefore > 12) return 20;
  if (hoursBefore > 6) return 30;
  if (hoursBefore > 2) return 40;
  if (hoursBefore > 1) return 55;
  if (hoursBefore > 0) return 70;
  return 70;
}

/** Bible: late join deductions from minutes late (after scheduled start). */
export function lateJoinDeductionPoints(minutesLate: number): number {
  if (minutesLate <= 0) return 0;
  if (minutesLate <= 3) return 5;
  if (minutesLate <= 5) return 10;
  if (minutesLate <= 10) return 20;
  return 50;
}

function minutesLateFromJoin(joinedIso: string, sessionDate: string, startTime: string | null | undefined): number | null {
  const start = sessionWallClockInstant(String(sessionDate), startTime);
  if (!start) return null;
  const j = new Date(joinedIso).getTime();
  if (!Number.isFinite(j)) return null;
  return Math.floor((j - start.getTime()) / 60000);
}

function cancellationPublicPhrase(hoursBefore: number): string {
  if (hoursBefore > 24) return "cancelling your booking more than 24 hours before the scheduled start";
  if (hoursBefore > 12) return "cancelling your booking 12–24 hours before the scheduled start";
  if (hoursBefore > 6) return "cancelling your booking 6–12 hours before the scheduled start";
  if (hoursBefore > 2) return "cancelling your booking 2–6 hours before the scheduled start";
  if (hoursBefore > 1) return "cancelling your booking 1–2 hours before the scheduled start";
  if (hoursBefore > 0) return "cancelling your booking within 1 hour before the scheduled start";
  return "cancelling at or after the scheduled start time";
}

function reschedulePublicPhrase(hoursBefore: number): string {
  if (hoursBefore > 24) return "suggesting a reschedule more than 24 hours before the scheduled start";
  if (hoursBefore > 12) return "suggesting a reschedule 12–24 hours before the scheduled start";
  if (hoursBefore > 6) return "suggesting a reschedule 6–12 hours before the scheduled start";
  if (hoursBefore > 2) return "suggesting a reschedule 2–6 hours before the scheduled start";
  if (hoursBefore > 1) return "suggesting a reschedule 1–2 hours before the scheduled start";
  if (hoursBefore > 0) return "suggesting a reschedule within 1 hour before the scheduled start";
  return "suggesting a reschedule at or after the scheduled start time";
}

function isNoShowLikeStatus(statusLower: string): boolean {
  return statusLower.includes("no_show") || statusLower.includes("no-show") || statusLower.includes("noshow");
}

/**
 * When the finalize cron has not run yet, infer the terminal no-show outcome from
 * join timestamps once the scheduled session window has ended.
 */
export function inferTerminalNoShowStatus(
  booking: Pick<
    BookingDependabilityInput,
    "session_date" | "end_time" | "status" | "cancelled_at" | "learner_joined" | "expert_joined"
  >,
): "no_show" | "no_show_learner" | "no_show_expert" | null {
  const st = String(booking.status ?? "").toLowerCase();
  if (st === "no_show") return "no_show";
  if (st === "no_show_learner") return "no_show_learner";
  if (st === "no_show_expert") return "no_show_expert";
  if (booking.cancelled_at || st === "cancelled" || st === "canceled") return null;
  if (st !== "upcoming" && st !== "live") return null;
  if (!hasSessionEndedByWallClock(booking.session_date, booking.end_time)) return null;

  const learnerJoined = booking.learner_joined != null && String(booking.learner_joined).trim() !== "";
  const expertJoined = booking.expert_joined != null && String(booking.expert_joined).trim() !== "";
  if (!learnerJoined && !expertJoined) return "no_show";
  if (!learnerJoined) return "no_show_learner";
  if (!expertJoined) return "no_show_expert";
  return null;
}

function humanHoursBefore(hoursBefore: number): string {
  if (hoursBefore > 48) return `${Math.round(hoursBefore / 24)} days before`;
  if (hoursBefore >= 24) return `${hoursBefore.toFixed(1)} hours before`;
  if (hoursBefore >= 1) return `${hoursBefore.toFixed(1)} hours before`;
  const m = Math.max(0, Math.round(hoursBefore * 60));
  return m >= 1 ? `${m} minutes before` : "at or after scheduled start";
}

export type BookingDependabilityInput = {
  session_date: string;
  start_time: string | null | undefined;
  end_time?: string | null;
  status?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  learner_user_id: string;
  expert_user_id: string;
  learner_joined?: string | null;
  expert_joined?: string | null;
  learner_delay?: number | null;
  expert_delay?: number | null;
  learner_dependability?: number | null;
  expert_dependability?: number | null;
  extensions?: number | null;
  extensions_amount?: number | string | null;
  reschedule_request_id?: string | null;
};

export type RescheduleMessageMeta = {
  created_at: string;
  sender_id: string;
} | null;

/**
 * Build a per-booking dependability breakdown for the Bible rules (Educational — may not match backend if scores are authored elsewhere).
 */
export function computeDependabilityBreakdown(
  booking: BookingDependabilityInput,
  viewerUserId: string,
  rescheduleMessage: RescheduleMessageMeta,
): DependabilityBreakdownResult {
  const viewerRole =
    booking.learner_user_id === viewerUserId
      ? "learner"
      : booking.expert_user_id === viewerUserId
        ? "expert"
        : (null as unknown as "learner" | "expert");

  const notes: string[] = [];
  if (!viewerRole) {
    notes.push("Viewer is not a participant on this booking.");
  }

  const startInstant = sessionWallClockInstant(String(booking.session_date), booking.start_time);
  const scheduledStartMs = startInstant?.getTime() ?? null;
  const scheduledStartLabel = startInstant ? formatLocalDateTime(startInstant) : null;

  const st = String(booking.status ?? "").toLowerCase();
  const isCancelled = st === "cancelled" || st === "canceled" || !!booking.cancelled_at;

  const inferredNoShow = inferTerminalNoShowStatus(booking);

  const joinIso = viewerRole === "learner" ? booking.learner_joined ?? null : booking.expert_joined ?? null;
  const joinTimeLabel = joinIso && Number.isFinite(Date.parse(joinIso)) ? formatLocalDateTime(new Date(joinIso)) : null;

  const delayCol = viewerRole === "learner" ? booking.learner_delay : booking.expert_delay;
  let minutesLate: number | null =
    typeof delayCol === "number" && Number.isFinite(delayCol) && delayCol > 0 ? Math.round(delayCol) : null;
  if (minutesLate == null && joinIso && scheduledStartMs != null) {
    minutesLate = minutesLateFromJoin(joinIso, booking.session_date, booking.start_time);
    if (minutesLate != null && minutesLate <= 0) minutesLate = 0;
    if (minutesLate === 0) minutesLate = null;
  }

  const storedSessionScore =
    viewerRole === "learner"
      ? booking.learner_dependability != null && Number.isFinite(Number(booking.learner_dependability))
        ? Number(booking.learner_dependability)
        : null
      : booking.expert_dependability != null && Number.isFinite(Number(booking.expert_dependability))
        ? Number(booking.expert_dependability)
        : null;

  let cancellationSummary: string | null = null;
  let rescheduleSummary: string | null = null;
  const lineItems: DependabilityLineItem[] = [];

  const noShowSpecific =
    (viewerRole === "learner" && (st === "no_show_learner" || inferredNoShow === "no_show_learner")) ||
    (viewerRole === "expert" && (st === "no_show_expert" || inferredNoShow === "no_show_expert"));

  /** Neither party joined — penalty applies to both sides for this session outcome. */
  const noShowBoth = st === "no_show" || inferredNoShow === "no_show";
  const viewerNoShow = noShowSpecific || noShowBoth;

  if (viewerNoShow) {
    lineItems.push({
      code: "no_show",
      label: noShowBoth
        ? "Neither party joined before session end (dual no-show). Convene applies the full no-show deduction to each participant who did not attend without cancelling or rescheduling."
        : "Did not join the booked session without cancelling or attempting to reschedule (session outcome).",
      deduction: 100,
      publicPhrase: noShowBoth
        ? "not joining your booked session (dual no-show outcome)"
        : "not joining your booked session without cancelling or rescheduling first",
    });
  } else if (isCancelled && booking.cancelled_at) {
    const cancelledBy = booking.cancelled_by ? String(booking.cancelled_by) : null;
    if (cancelledBy === viewerUserId && scheduledStartMs != null) {
      const ct = Date.parse(booking.cancelled_at);
      if (Number.isFinite(ct)) {
        const hb = hoursBeforeScheduledStart(scheduledStartMs, ct);
        const pts = cancellationDeductionPoints(hb);
        cancellationSummary = `Cancelled ${humanHoursBefore(hb)} the scheduled start.`;
        lineItems.push({
          code: "cancellation",
          label: `Cancelled booking (${cancellationSummary})`,
          deduction: pts,
          publicPhrase: cancellationPublicPhrase(hb),
        });
      }
    } else if (cancelledBy && cancelledBy !== viewerUserId) {
      cancellationSummary = "Another participant cancelled this session; no cancellation penalty applies to you for this event.";
    } else if (!cancelledBy) {
      notes.push("Cancellation time is recorded, but `cancelled_by` is missing — penalty not attributed.");
    }
  }

  if (!viewerNoShow && rescheduleMessage && rescheduleMessage.sender_id === viewerUserId && scheduledStartMs != null) {
    const mt = Date.parse(rescheduleMessage.created_at);
    if (Number.isFinite(mt)) {
      const hb = hoursBeforeScheduledStart(scheduledStartMs, mt);
      const pts = rescheduleSuggestionDeductionPoints(hb);
      rescheduleSummary = `You proposed a new time ${humanHoursBefore(hb)} the scheduled start.`;
      lineItems.push({
        code: "reschedule_suggest",
        label: `Suggested a rescheduled time (${humanHoursBefore(hb)} scheduled start).`,
        deduction: pts,
        publicPhrase: reschedulePublicPhrase(hb),
      });
    }
  } else if (rescheduleMessage && rescheduleMessage.sender_id !== viewerUserId) {
    rescheduleSummary = "A reschedule was proposed by your session partner; no reschedule-suggestion penalty applies to you for that proposal.";
  }

  if (!viewerNoShow && !isCancelled && minutesLate != null && minutesLate > 0) {
    const pts = lateJoinDeductionPoints(minutesLate);
    if (pts > 0) {
      lineItems.push({
        code: "late_join",
        label:
          minutesLate <= 3
            ? `Joined ${minutesLate} minute(s) late (1–3 min).`
            : minutesLate <= 5
              ? `Joined ${minutesLate} minute(s) late (3–5 min).`
              : minutesLate <= 10
                ? `Joined ${minutesLate} minute(s) late (5–10 min).`
                : `Joined ${minutesLate} minute(s) late (more than 10 min).`,
        deduction: pts,
        publicPhrase:
          minutesLate <= 3
            ? "joining session 1–3 min late"
            : minutesLate <= 5
              ? "joining session 3–5 min late"
              : minutesLate <= 10
                ? "joining session 5–10 min late"
                : "joining session more than 10 min late",
      });
    }
  }

  const totalDeduction = Math.min(100, lineItems.reduce((s, x) => s + x.deduction, 0));
  const sessionScore = Math.max(0, 100 - totalDeduction);
  const viewerSessionScore =
    storedSessionScore != null && Number.isFinite(storedSessionScore)
      ? Math.round(storedSessionScore)
      : Math.round(sessionScore);

  const extN = Number(booking.extensions ?? 0);
  const extensionsCount = Number.isFinite(extN) ? Math.max(0, Math.round(extN)) : 0;
  const extAmt = Number(booking.extensions_amount ?? 0);
  const extensionsAmountUsd = Number.isFinite(extAmt) ? extAmt : 0;

  if (storedSessionScore != null && Math.abs(storedSessionScore - sessionScore) > 2) {
    notes.push(
      "Stored session dependability score in the database differs from this breakdown (backend may use additional signals). Both are shown.",
    );
  }

  return {
    viewerUserId,
    viewerRole: viewerRole ?? "learner",
    scheduledStartMs,
    scheduledStartLabel,
    joinTimeIso: joinIso,
    joinTimeLabel,
    minutesLate: minutesLate != null && minutesLate > 0 ? minutesLate : null,
    cancelledAtIso: booking.cancelled_at ? String(booking.cancelled_at) : null,
    cancelledByUserId: booking.cancelled_by ? String(booking.cancelled_by) : null,
    cancellationSummary,
    rescheduleMessageAtIso: rescheduleMessage?.created_at ?? null,
    rescheduleProposerUserId: rescheduleMessage?.sender_id ?? null,
    rescheduleSummary,
    extensionsCount,
    extensionsAmountUsd,
    lineItems,
    totalDeduction,
    sessionScore,
    storedSessionScore,
    viewerSessionScore,
    notes,
  };
}

/**
 * Bible §"freelance_work — status enum, transitions, keys, payment"
 *
 * Single source of truth for the freelance_work state machine. Centralized so
 * the API route, Stripe webhook, cron sweep, and admin handler all share the
 * same allowed-transition table and SLA-deadline math.
 *
 * Statuses (DB enum mirror, see supabase/v2/046_freelance_lifecycle.sql):
 *   offered
 *   declined
 *   accepted_pending_payment        — optional; payment is usually synchronous so we may skip
 *   paid_in_progress
 *   completion_submitted
 *   completed                       — terminal
 *   refunded                        — terminal
 *   admin_review
 */

export const FREELANCE_STATUSES = [
  "offered",
  "declined",
  "accepted_pending_payment",
  "paid_in_progress",
  "completion_submitted",
  "completed",
  "refunded",
  "admin_review",
] as const;

export type FreelanceStatus = (typeof FREELANCE_STATUSES)[number];

/**
 * SLA windows (Bible: "3 calendar days"). Treated as 72h from the relevant
 * anchor to stay timezone-agnostic; tighten to a true calendar-day add later
 * if product asks.
 */
export const FREELANCE_GRACE_DAYS = 3;
export const FREELANCE_AUTO_RELEASE_DAYS = 3;
export const FREELANCE_RECTIFICATION_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** SLA helpers — keep aligned with the SQL helper `freelance_compute_sla`. */
export function expertGraceEndAt(workDeadlineIso: string | null | undefined): string | null {
  return addDays(workDeadlineIso, FREELANCE_GRACE_DAYS);
}
export function learnerCompletionDeadlineAt(submittedAtIso: string | null | undefined): string | null {
  return addDays(submittedAtIso, FREELANCE_AUTO_RELEASE_DAYS);
}
export function rectificationDeadlineAt(adminReviewAtIso: string | null | undefined): string | null {
  return addDays(adminReviewAtIso, FREELANCE_RECTIFICATION_DAYS);
}

function addDays(iso: string | null | undefined, days: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + days * DAY_MS).toISOString();
}

/**
 * Allowed transition table per Bible. Map of from → set of allowed nexts.
 * Used to gate every status change in one place.
 */
const TRANSITIONS: Readonly<Record<FreelanceStatus, ReadonlyArray<FreelanceStatus>>> = {
  offered: ["declined", "accepted_pending_payment", "paid_in_progress"],
  declined: ["offered"], // expert may re-offer (creates a new row with supersedes_freelance_id; this entry is for explicit "reopen" of the same row)
  accepted_pending_payment: ["paid_in_progress", "offered"], // back to offered if payment cancelled
  paid_in_progress: ["completion_submitted", "admin_review", "refunded"], // refunded reachable via admin
  completion_submitted: ["completed", "admin_review", "refunded"],
  completed: [], // terminal
  refunded: [], // terminal
  admin_review: ["completed", "refunded"],
};

export function canTransition(from: FreelanceStatus, to: FreelanceStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(from: FreelanceStatus): ReadonlyArray<FreelanceStatus> {
  return TRANSITIONS[from] ?? [];
}

export function isTerminalStatus(s: FreelanceStatus): boolean {
  return s === "completed" || s === "refunded";
}

/**
 * Bible-style action verbs. The API maps each action to (a) the required
 * actor, (b) the prerequisite status(es), (c) the resulting status. Keeping
 * this table separate from `TRANSITIONS` means each action enforces its own
 * actor rules instead of relying on UI conventions.
 */
export type FreelanceActor = "expert" | "learner" | "admin" | "system";

export type FreelanceAction =
  | "accept"               // learner: offered → accepted_pending_payment (or → paid_in_progress when atomic)
  | "decline"              // learner: offered → declined
  | "reoffer"              // expert: declined → offered (revise & resend the same row)
  | "mark_paid"            // system (Stripe webhook): offered|accepted_pending_payment → paid_in_progress
  | "submit_completion"    // expert: paid_in_progress → completion_submitted
  | "accept_completion"    // learner: completion_submitted → completed (release payout)
  | "decline_completion"   // learner: completion_submitted → admin_review (rectification clock starts)
  | "auto_release"         // system (cron): completion_submitted → completed after 3-day silence
  | "escalate_missed_deadline" // system (cron): paid_in_progress → admin_review after grace
  | "admin_resolve_complete"   // admin: admin_review → completed
  | "admin_resolve_refund";    // admin: admin_review → refunded

type ActionSpec = {
  actor: FreelanceActor;
  /** Allowed prerequisite statuses. */
  from: ReadonlyArray<FreelanceStatus>;
  to: FreelanceStatus;
};

export const FREELANCE_ACTIONS: Readonly<Record<FreelanceAction, ActionSpec>> = {
  accept:                    { actor: "learner", from: ["offered"], to: "accepted_pending_payment" },
  decline:                   { actor: "learner", from: ["offered"], to: "declined" },
  reoffer:                   { actor: "expert",  from: ["declined"], to: "offered" },
  mark_paid:                 { actor: "system",  from: ["offered", "accepted_pending_payment"], to: "paid_in_progress" },
  submit_completion:         { actor: "expert",  from: ["paid_in_progress"], to: "completion_submitted" },
  accept_completion:         { actor: "learner", from: ["completion_submitted"], to: "completed" },
  decline_completion:        { actor: "learner", from: ["completion_submitted"], to: "admin_review" },
  auto_release:              { actor: "system",  from: ["completion_submitted"], to: "completed" },
  escalate_missed_deadline:  { actor: "system",  from: ["paid_in_progress"], to: "admin_review" },
  admin_resolve_complete:    { actor: "admin",   from: ["admin_review"], to: "completed" },
  admin_resolve_refund:      { actor: "admin",   from: ["admin_review"], to: "refunded" },
};

/** Human-friendly label for status pills / dashboards. */
export const FREELANCE_STATUS_LABEL: Readonly<Record<FreelanceStatus, string>> = {
  offered: "Offered",
  declined: "Declined",
  accepted_pending_payment: "Awaiting payment",
  paid_in_progress: "In progress",
  completion_submitted: "Completion submitted",
  completed: "Completed",
  refunded: "Refunded",
  admin_review: "In admin review",
};

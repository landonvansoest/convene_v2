import { hasSessionEndedByWallClock } from "@/lib/sessionWallClock";
import {
  isAwaitingExpertBookingRequest,
  isBookingRequestSubmittedToExpert,
} from "@/lib/booking-request";

/** Unpaid card checkouts (legacy POST /api/sessions) — hidden from default lists until paid or failed. */
export function bookingVisibleInDefaultSessionLists(paymentStatus: unknown): boolean {
  const ps = String(paymentStatus ?? "").toLowerCase();
  return ps !== "pending";
}

/**
 * Session rows for `/api/sessions*`: learners hide stale unpaid checkouts; experts must still see unpaid
 * `pending` bookings on their calendar.
 */
export function bookingRowVisibleInSessionList(paymentStatus: unknown, userRole: unknown): boolean {
  if (bookingVisibleInDefaultSessionLists(paymentStatus)) return true;
  const role = String(userRole ?? "").toLowerCase();
  const ps = String(paymentStatus ?? "").toLowerCase();
  // Unpaid checkout: experts track open bookings; learners must pay after expert approval.
  return ps === "pending" && (role === "expert" || role === "learner");
}

type UpcomingSessionRow = {
  status?: unknown;
  cancelled_at?: unknown;
  session_date?: unknown;
  end_time?: unknown;
  payment_status?: unknown;
  stripe_payment_method_id?: unknown;
  learner_user_id?: string | null;
  expert_user_id?: string | null;
  user_role?: unknown;
};

/** Matches DashboardBookedSessionsView “Upcoming” tab — used for header/sidebar badges. */
export function isUpcomingBookedSessionRow(
  b: UpcomingSessionRow,
  viewerUserId?: string,
): boolean {
  const st = String(b.status ?? "").toLowerCase();
  const cancelled = st === "cancelled" || Boolean(b.cancelled_at);
  const ps = String(b.payment_status ?? "").toLowerCase();
  const sessionDate = String(b.session_date ?? "");
  const endedByWall = hasSessionEndedByWallClock(sessionDate, b.end_time as string | null | undefined);

  if (endedByWall && ps === "pending") return false;

  const userRole =
    b.user_role != null
      ? String(b.user_role).toLowerCase()
      : viewerUserId && b.learner_user_id === viewerUserId
        ? "learner"
        : viewerUserId
          ? "expert"
          : "";

  if (userRole && !bookingRowVisibleInSessionList(b.payment_status, userRole)) return false;

  if (
    userRole === "expert" &&
    isAwaitingExpertBookingRequest(b.payment_status) &&
    !isBookingRequestSubmittedToExpert(b.payment_status, b.stripe_payment_method_id)
  ) {
    return false;
  }

  if (st === "complete" || cancelled || endedByWall) return false;
  return st === "upcoming" || st === "live";
}

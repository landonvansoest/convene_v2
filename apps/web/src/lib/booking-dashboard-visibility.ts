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
  return role === "expert" && ps === "pending";
}

/** Learner submitted a time; expert must approve before payment. */
export function isAwaitingExpertBookingRequest(paymentStatus: unknown): boolean {
  return String(paymentStatus ?? "").toLowerCase() === "awaiting_expert";
}

/** Card saved — request is visible to the expert for approve/decline. */
export function isBookingRequestSubmittedToExpert(
  paymentStatus: unknown,
  stripePaymentMethodId: unknown,
): boolean {
  return (
    isAwaitingExpertBookingRequest(paymentStatus) &&
    Boolean(String(stripePaymentMethodId ?? "").trim())
  );
}

/** Learner started a request but has not saved a payment method yet. */
export function isBookingRequestAwaitingPaymentMethod(
  paymentStatus: unknown,
  stripePaymentMethodId: unknown,
): boolean {
  return (
    isAwaitingExpertBookingRequest(paymentStatus) &&
    !String(stripePaymentMethodId ?? "").trim()
  );
}

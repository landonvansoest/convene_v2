/**
 * User-facing copy for Stripe checkout failures — avoids echoing raw idempotency/API details.
 */
export type StripeCheckoutUiContext = "session_booking" | "session_extension" | "generic";

function idempotencyReuseMessage(context: StripeCheckoutUiContext): string {
  switch (context) {
    case "session_extension":
      return "Checkout couldn't reuse the last payment attempt. Close this and tap Extend again.";
    case "session_booking":
      return "Checkout couldn't reuse the last payment attempt. Close this and tap Book session again.";
    default:
      return "Checkout couldn't reuse the last payment attempt. Close this dialog and try again.";
  }
}

export function sanitizeStripeMessageForUi(message: string, context: StripeCheckoutUiContext = "generic"): string {
  const t = message.trim();
  if (!t) return "Something went wrong. Please try again.";
  const l = t.toLowerCase();
  if (l.includes("keys for idempotent requests") || (l.includes("idempotent") && l.includes("same parameters"))) {
    return idempotencyReuseMessage(context);
  }
  if (l.includes("paypal") && (l.includes("invalid") || l.includes("activated"))) {
    return "That payment option isn't available here. Use a debit or credit card.";
  }
  if (t.length > 160 || l.includes("dashboard.stripe.com") || l.includes("stripe.com/account"))
    return "We couldn't start secure checkout. Please try again.";
  return t;
}

export function publicStripePaymentSetupError(
  err: unknown,
  context: StripeCheckoutUiContext = "generic",
): string {
  const raw =
    err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? String((err as { message: string }).message)
      : typeof err === "string"
        ? err
        : "";
  return sanitizeStripeMessageForUi(raw, context);
}

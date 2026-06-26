import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

/** Display form of ledger `transactions.transaction_id` for receipts and support. */
export function formatPaymentConfirmationNumber(transactionId: string): string {
  return transactionId.trim().toUpperCase();
}

/**
 * Resolves the Convene ledger reference after a succeeded PaymentIntent.
 * Package purchases store the PI id on `transactions.stripe_checkout_session_id`.
 */
export async function lookupConfirmationNumberForPaymentIntent(
  admin: SupabaseClient,
  pi: Stripe.PaymentIntent,
): Promise<string | null> {
  const packagePurchase = (pi.metadata?.convene_type ?? "").trim() === "package_purchase";
  if (packagePurchase) {
    const { data } = await admin
      .from("transactions")
      .select("transaction_id")
      .eq("stripe_checkout_session_id", pi.id)
      .eq("transaction_type", "package_purchase")
      .eq("status", "succeeded")
      .maybeSingle();
    return data?.transaction_id ?? null;
  }

  const bookingIdFromMeta = String(pi.metadata?.bookingId ?? "").trim();
  if (bookingIdFromMeta) {
    const { data } = await admin
      .from("transactions")
      .select("transaction_id")
      .eq("booking_id", bookingIdFromMeta)
      .eq("transaction_type", "session_booking")
      .eq("status", "succeeded")
      .maybeSingle();
    if (data?.transaction_id) return data.transaction_id;
  }

  const { data: booking } = await admin
    .from("bookings")
    .select("booking_id")
    .eq("stripe_payment_intent_id", pi.id)
    .maybeSingle();

  if (booking?.booking_id) {
    const { data } = await admin
      .from("transactions")
      .select("transaction_id")
      .eq("booking_id", booking.booking_id)
      .eq("transaction_type", "session_booking")
      .eq("status", "succeeded")
      .maybeSingle();
    return data?.transaction_id ?? booking.booking_id;
  }

  return null;
}

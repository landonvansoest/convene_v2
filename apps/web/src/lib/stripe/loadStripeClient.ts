import { loadStripe, type Stripe } from "@stripe/stripe-js";

export const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";

/**
 * Single shared Stripe.js instance for Elements. Disables the test-mode **testing assistant**
 * (floating “stripe” control in the lower-right) so it does not appear over unrelated UI
 * (e.g. dashboard) after a payment flow has loaded Stripe.
 */
export const stripePromise: Promise<Stripe | null> | null = STRIPE_PUBLISHABLE_KEY
  ? loadStripe(STRIPE_PUBLISHABLE_KEY, {
      developerTools: {
        assistant: { enabled: false },
      },
    })
  : null;

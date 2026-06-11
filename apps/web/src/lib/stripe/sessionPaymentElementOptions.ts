import type { Appearance, StripePaymentElementOptions } from "@stripe/stripe-js";

/**
 * Session checkout Payment Element — must agree with `/api/stripe/create-payment-intent` (`payment_method_types`).
 * Tabs list only methods enabled on the PaymentIntent; wallets on `card` cover Apple / Google Pay.
 */
export const SESSION_PAYMENT_ELEMENT_OPTIONS: StripePaymentElementOptions = {
  layout: { type: "tabs" },
  paymentMethodOrder: ["card", "apple_pay", "google_pay"],
  wallets: {
    applePay: "auto",
    googlePay: "auto",
    link: "never",
  },
  /** Shown in off-session / mandate copy (replaces incorrect Dashboard business name in dev). */
  business: {
    name: "convene",
  },
};

export const SESSION_PAYMENT_ELEMENTS_APPEARANCE: Appearance = {
  theme: "stripe",
  variables: {
    /** Mandate / legal line under Payment Element */
    fontSizeSm: "11px",
  },
};

/** Wizard subscription step: flatter, less on-brand “Stripe UI” than `theme: "stripe"`. */
export const VERIFIED_SUBSCRIPTION_ELEMENTS_APPEARANCE: Appearance = {
  theme: "flat",
  variables: {
    colorPrimary: "#003049",
    borderRadius: "12px",
    fontSizeSm: "11px",
  },
};

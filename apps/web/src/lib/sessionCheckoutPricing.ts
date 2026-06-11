/** Bible Session pricing: platform fee 10% of booking fee; taxes 6% of (booking fee + platform fee). */

export function roundUsd2(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100;
}

export type SessionCheckoutPricing = {
  booking_amount: number;
  platform_fee: number;
  /** booking_amount + platform_fee */
  subtotal_before_tax: number;
  taxes_fees: number;
  total_amount: number;
};

export function computeSessionCheckoutPricing(bookingFeeAfterDiscountUsd: number): SessionCheckoutPricing {
  const booking_amount = roundUsd2(bookingFeeAfterDiscountUsd);
  const platform_fee = roundUsd2(booking_amount * 0.1);
  const subtotal_before_tax = roundUsd2(booking_amount + platform_fee);
  const taxes_fees = roundUsd2(subtotal_before_tax * 0.06);
  const total_amount = roundUsd2(subtotal_before_tax + taxes_fees);
  return {
    booking_amount,
    platform_fee,
    subtotal_before_tax,
    taxes_fees,
    total_amount,
  };
}

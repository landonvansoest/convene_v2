import type { ExpertPayoutDetailsInput } from "@/components/expert/ExpertPayoutInformationFields";

/** Keys used for invalid-field highlighting (wizard + profile payout dialog). */
export type ExpertPayoutValidationField = "phone_number" | keyof ExpertPayoutDetailsInput;

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function countryNorm(c: string): string {
  const t = c.trim().toUpperCase();
  return t || "US";
}

/**
 * Validation for US ACH-style manual payout details stored on the profile / registration draft.
 * Aligns with typical bank account + routing requirements used before Connect tokenization.
 */
export function validateExpertPayoutBankingDetails(
  phoneNumber: string,
  payout: ExpertPayoutDetailsInput,
): { ok: true } | { ok: false; message: string; fields: ExpertPayoutValidationField[] } {
  const fields: ExpertPayoutValidationField[] = [];
  const country = countryNorm(payout.country);

  const phoneDigits = digitsOnly(phoneNumber);
  if (phoneDigits.length < 10) {
    fields.push("phone_number");
  }

  const legal = payout.legal_name.trim();
  if (legal.length < 2) {
    fields.push("legal_name");
  }

  if (!payout.address_line1.trim()) {
    fields.push("address_line1");
  }
  if (!payout.city.trim()) {
    fields.push("city");
  }
  if (!payout.state.trim()) {
    fields.push("state");
  }

  const postal = payout.postal_code.trim();
  if (!postal) {
    fields.push("postal_code");
  } else if (country === "US") {
    const okZip = /^\d{5}(-\d{4})?$/.test(postal);
    if (!okZip) {
      fields.push("postal_code");
    }
  }

  const routingDigits = digitsOnly(payout.routing_number);
  const accountDigits = digitsOnly(payout.account_number);

  if (country === "US") {
    if (routingDigits.length !== 9) {
      fields.push("routing_number");
    }
    if (accountDigits.length < 6 || accountDigits.length > 17) {
      fields.push("account_number");
    }
  } else {
    if (routingDigits.length < 4) {
      fields.push("routing_number");
    }
    if (accountDigits.length < 4) {
      fields.push("account_number");
    }
  }

  const tax = payout.tax_id_last4.trim();
  if (tax && digitsOnly(tax).length !== 4) {
    fields.push("tax_id_last4");
  }

  const unique = Array.from(new Set(fields));
  if (unique.length === 0) {
    return { ok: true };
  }

  const message =
    country === "US"
      ? "Enter a valid phone, legal name, full address, 9-digit routing number, and a 6–17 digit account number."
      : "Enter a valid phone, legal name, full address, and bank routing and account numbers.";

  return { ok: false, message, fields: unique };
}

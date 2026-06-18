import type { PostgrestError } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { publicApiError } from "@/lib/api/public-error";

/** Attach session payments to this Customer so the card used to book can be charged again (extensions). */
export type EnsureLearnerCustomerResult =
  | { ok: true; customerId: string }
  | { ok: false; error: string };

type UserRow = {
  user_id: string;
  email_address: string | null;
  full_name?: string | null;
  stripe_customer_id?: string | null;
};

function missingUsersStripeCustomerColumn(err: PostgrestError | null | undefined): boolean {
  const msg = err?.message?.toLowerCase() ?? "";
  return (
    msg.includes("stripe_customer_id") ||
    (msg.includes("column") && msg.includes("does not exist")) ||
    msg.includes("schema cache")
  );
}

/**
 * Ensures the learner has a Stripe Customer and persists `users.stripe_customer_id` when the column exists
 * (migration `037_users_stripe_customer_id.sql` / v2 core). If the column is missing, still creates the
 * Customer in Stripe and uses it for the PaymentIntent, but skips persistence.
 */
export async function ensureLearnerStripeCustomer(
  stripe: Stripe,
  admin: SupabaseClient,
  learnerUserId: string,
): Promise<EnsureLearnerCustomerResult> {
  let { data: u, error } = await admin
    .from("users")
    .select("user_id, email_address, full_name, stripe_customer_id")
    .eq("user_id", learnerUserId)
    .maybeSingle();

  if (error && missingUsersStripeCustomerColumn(error)) {
    ({ data: u, error } = await admin
      .from("users")
      .select("user_id, email_address, full_name")
      .eq("user_id", learnerUserId)
      .maybeSingle());
    if (u) {
      (u as UserRow).stripe_customer_id = null;
    }
  }

  if (error) {
    return { ok: false, error: publicApiError(error) };
  }
  if (!u) {
    return { ok: false, error: "User not found" };
  }

  const row = u as UserRow;
  const existing =
    typeof row.stripe_customer_id === "string" ? String(row.stripe_customer_id).trim() : "";
  if (existing) {
    return { ok: true, customerId: existing };
  }

  const email = typeof row.email_address === "string" ? row.email_address.trim() : "";
  if (!email) {
    return { ok: false, error: "User email required for Stripe customer" };
  }

  try {
    const customer = await stripe.customers.create({
      email,
      name: typeof row.full_name === "string" && row.full_name.trim() ? row.full_name.trim() : undefined,
      metadata: { convene_user_id: learnerUserId },
    });

    const now = new Date().toISOString();
    const { error: upErr } = await admin
      .from("users")
      .update({ stripe_customer_id: customer.id, updated_at: now } as Record<string, unknown>)
      .eq("user_id", learnerUserId);

    if (upErr) {
      if (missingUsersStripeCustomerColumn(upErr)) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[stripe] users.stripe_customer_id not in DB; skipping persist (apply supabase/v2/037_users_stripe_customer_id.sql)",
          );
        }
      } else {
        console.error("[stripe] persist stripe_customer_id failed", upErr.message);
      }
    }

    return { ok: true, customerId: customer.id };
  } catch (e) {
    return { ok: false, error: publicApiError(e, "Could not create Stripe customer") };
  }
}

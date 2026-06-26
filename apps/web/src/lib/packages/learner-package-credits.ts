import type { SupabaseClient } from "@supabase/supabase-js";

export type UsablePackageCredit = {
  credit_id: string;
  package_id: string;
  remaining_credits: number;
  session_duration_minutes: number;
  expiration_at: string | null;
};

export function isPackageCreditUsable(
  credit: { remaining_credits: number; expiration_at?: string | null },
  nowMs = Date.now(),
): boolean {
  if (credit.remaining_credits <= 0) return false;
  if (credit.expiration_at) {
    const exp = new Date(credit.expiration_at).getTime();
    if (Number.isFinite(exp) && exp < nowMs) return false;
  }
  return true;
}

export async function listUsablePackageCreditsForExpert(
  admin: SupabaseClient,
  learnerUserId: string,
  expertUserId: string,
): Promise<UsablePackageCredit[]> {
  const { data: rows, error } = await admin
    .from("learner_package_credits")
    .select(
      `
      credit_id,
      package_id,
      remaining_credits,
      expiration_at,
      expert_packages (
        expert_user_id,
        session_duration_minutes
      )
    `,
    )
    .eq("learner_user_id", learnerUserId)
    .gt("remaining_credits", 0);

  if (error || !rows?.length) return [];

  const out: UsablePackageCredit[] = [];
  for (const row of rows) {
    const embed = row.expert_packages as
      | { expert_user_id: string; session_duration_minutes: number }
      | { expert_user_id: string; session_duration_minutes: number }[]
      | null;
    const pkg = Array.isArray(embed) ? embed[0] : embed;
    if (!pkg || pkg.expert_user_id !== expertUserId) continue;
    if (!isPackageCreditUsable(row)) continue;
    out.push({
      credit_id: row.credit_id,
      package_id: row.package_id,
      remaining_credits: row.remaining_credits,
      session_duration_minutes: pkg.session_duration_minutes,
      expiration_at: row.expiration_at,
    });
  }
  return out;
}

export type ValidatePackageCreditResult =
  | { ok: true; creditId: string; packageId: string }
  | { ok: false; status: number; error: string };

/** Validates a learner credit for booking with this expert at the given duration. */
export async function validatePackageCreditForBooking(
  admin: SupabaseClient,
  input: {
    creditId: string;
    learnerUserId: string;
    expertUserId: string;
    durationMinutes: number;
  },
): Promise<ValidatePackageCreditResult> {
  const { creditId, learnerUserId, expertUserId, durationMinutes } = input;

  const { data: creditRow, error: credErr } = await admin
    .from("learner_package_credits")
    .select(
      `
      credit_id,
      package_id,
      remaining_credits,
      expiration_at,
      expert_packages (
        expert_user_id,
        session_duration_minutes
      )
    `,
    )
    .eq("credit_id", creditId)
    .eq("learner_user_id", learnerUserId)
    .maybeSingle();

  if (credErr) {
    return { ok: false, status: 500, error: credErr.message };
  }
  if (!creditRow) {
    return { ok: false, status: 404, error: "Package credit not found" };
  }

  const pkgEmbed = creditRow.expert_packages as
    | { expert_user_id: string; session_duration_minutes: number }
    | { expert_user_id: string; session_duration_minutes: number }[]
    | null;
  const pkg = Array.isArray(pkgEmbed) ? pkgEmbed[0] : pkgEmbed;
  if (!pkg) {
    return { ok: false, status: 400, error: "Package not found for credit" };
  }
  if (pkg.expert_user_id !== expertUserId) {
    return { ok: false, status: 400, error: "Credit does not apply to this expert" };
  }
  if (durationMinutes !== pkg.session_duration_minutes) {
    return {
      ok: false,
      status: 400,
      error: `Duration must match package session length (${pkg.session_duration_minutes} min)`,
    };
  }
  if (creditRow.remaining_credits <= 0) {
    return { ok: false, status: 409, error: "No credits remaining" };
  }
  if (!isPackageCreditUsable(creditRow)) {
    return { ok: false, status: 409, error: "Package credit has expired" };
  }

  return { ok: true, creditId, packageId: creditRow.package_id };
}

/** Atomically decrement credit and record redemption; rolls back decrement on redemption insert failure. */
export async function redeemPackageCreditForBooking(
  admin: SupabaseClient,
  input: {
    creditId: string;
    learnerUserId: string;
    bookingId: string;
  },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { creditId, learnerUserId, bookingId } = input;
  const now = new Date().toISOString();

  const { data: snap } = await admin
    .from("learner_package_credits")
    .select("remaining_credits")
    .eq("credit_id", creditId)
    .eq("learner_user_id", learnerUserId)
    .maybeSingle();

  if (!snap || snap.remaining_credits <= 0) {
    return { ok: false, status: 409, error: "No credits remaining" };
  }

  const prev = snap.remaining_credits;
  const { data: dec } = await admin
    .from("learner_package_credits")
    .update({
      remaining_credits: prev - 1,
      updated_at: now,
    })
    .eq("credit_id", creditId)
    .eq("learner_user_id", learnerUserId)
    .eq("remaining_credits", prev)
    .select("credit_id")
    .maybeSingle();

  if (!dec) {
    return { ok: false, status: 409, error: "Could not redeem credit (race or exhausted)" };
  }

  const { error: redErr } = await admin.from("package_credit_redemptions").insert({
    credit_id: creditId,
    booking_id: bookingId,
    credits_used: 1,
    created_at: now,
  });

  if (redErr) {
    await admin
      .from("learner_package_credits")
      .update({ remaining_credits: prev, updated_at: now })
      .eq("credit_id", creditId)
      .eq("remaining_credits", prev - 1);
    return { ok: false, status: 500, error: redErr.message };
  }

  return { ok: true };
}

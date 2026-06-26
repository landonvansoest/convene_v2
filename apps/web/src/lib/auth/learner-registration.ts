/** Canonical URL for the learner post-signup registration wizard. */
export const LEARNER_REGISTRATION_WIZARD_PATH = "/auth/callback/signup";

/**
 * True when a learner has finished the registration wizard (step 6 / manual submit).
 * Experts skip the learner wizard — they use the expert registration flow instead.
 *
 * Uses `learner_registration_completed_at` (migration 052). Do not use
 * `convene_role_mode` — it defaults to `learner` on every new row.
 */
export function isLearnerRegistrationComplete(
  profile: Record<string, unknown> | null | undefined,
): boolean {
  if (!profile) return false;
  if (profile.has_expert_profile === true) return true;

  const completedAt = profile.learner_registration_completed_at;
  if (typeof completedAt === "string" && completedAt.trim().length > 0) return true;

  // Before migration 052 the column is absent from SELECT *; legacy fallback only
  // in that case (hometown is required to finish the wizard). Once the column
  // exists on the row — even when NULL — rely on it alone so mid-wizard autosave
  // of hometown does not skip the wizard.
  if (!("learner_registration_completed_at" in profile)) {
    const hometown = String(profile.hometown ?? "").trim();
    return hometown.length > 0;
  }

  return false;
}

/** Where to send a user immediately after they establish a session. */
export function postAuthDestination(
  profile: Record<string, unknown> | null | undefined,
): string {
  if (isLearnerRegistrationComplete(profile)) return "/dashboard";
  return LEARNER_REGISTRATION_WIZARD_PATH;
}

/** Client helper: fetch `/api/me` and resolve the post-sign-in path. */
export async function resolvePostSignInPath(
  explicitRedirect?: string | null,
): Promise<string> {
  if (explicitRedirect?.trim()) return explicitRedirect.trim();
  const res = await fetch("/api/me", {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => null)) as {
    profile?: Record<string, unknown> | null;
  } | null;
  return postAuthDestination(body?.profile ?? null);
}

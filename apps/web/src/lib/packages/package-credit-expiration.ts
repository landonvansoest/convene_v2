/** Bible default when expert_packages.credit_expiration_days is unset. */
export const DEFAULT_PACKAGE_CREDIT_EXPIRATION_DAYS = 365;

/** Compute learner_package_credits.expiration_at from package config. */
export function computePackageCreditExpirationAt(
  creditExpirationDays: number | null | undefined,
  grantedAt: Date = new Date(),
): string {
  const days =
    creditExpirationDays != null && creditExpirationDays > 0
      ? creditExpirationDays
      : DEFAULT_PACKAGE_CREDIT_EXPIRATION_DAYS;
  return new Date(grantedAt.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Supabase returns this when "Confirm email" is on and the user has not verified yet. */
export function isEmailNotConfirmedAuthError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /email not confirmed/i.test(message);
}

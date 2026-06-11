/**
 * PKCE / email-link return for post-signup confirm (dev bypass + inbox links).
 * Handler exchanges the session then redirects to **`/auth/callback/signup`** (wizard page).
 *
 * Whitelist in Supabase: Authentication → URL Configuration → Redirect URLs:
 * `{ORIGIN}/auth/callback/signup/complete`
 */
export function authCallbackWithSignupWizard(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/callback/signup/complete`;
}

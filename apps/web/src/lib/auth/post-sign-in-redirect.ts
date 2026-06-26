/** Safe same-origin path for post-auth redirects (matches pkce-callback rules). */
export function safeInternalRedirectPath(value: string | null | undefined): string | null {
  const path = value?.trim();
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("://")) {
    return null;
  }
  return path;
}

/** OAuth / magic-link return URL; preserves intended destination via `next`. */
export function authCallbackUrl(origin: string, postSignInRedirect?: string | null): string {
  const base = origin.replace(/\/$/, "");
  const next = safeInternalRedirectPath(postSignInRedirect);
  if (next) return `${base}/auth/callback?next=${encodeURIComponent(next)}`;
  return `${base}/auth/callback`;
}

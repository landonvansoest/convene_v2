import { completeSupabasePkceRedirect } from "@/lib/auth/pkce-callback";

export const dynamic = "force-dynamic";

/**
 * PKCE + email-link return for learner signup. After session is established, redirects
 * to **`/auth/callback/signup`** (registration wizard page).
 *
 * Supabase Dashboard → Authentication → Redirect URLs:
 * `{ORIGIN}/auth/callback/signup/complete`
 */
export async function GET(request: Request) {
  return completeSupabasePkceRedirect(request, { kind: "fixed", path: "/auth/callback/signup" });
}

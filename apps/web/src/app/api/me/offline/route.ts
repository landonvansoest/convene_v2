import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Mark the signed-in user offline immediately. Called on:
 *   - explicit sign-out (SiteHeader signOut())
 *   - pagehide / beforeunload via navigator.sendBeacon()
 *
 * sendBeacon sends application/json with no auth headers we can add, but the
 * Supabase auth cookie is forwarded automatically by the browser, so the
 * server-side getUser() still works. Body is ignored.
 *
 * Does NOT clear last_seen_at — only the boolean flag flips. The sweep cron
 * continues to enforce the 5-minute window for users whose tabs died without
 * firing a beacon.
 */
async function markOffline(): Promise<Response> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ online: false })
    .eq("user_id", user.id);

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ ok: true });
}

export async function POST() {
  return markOffline();
}

import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Online-presence heartbeat. Bible: users.online = true when last user action
 * or heartbeat was within the last 5 minutes. Client pings every ~3 minutes
 * while the tab is visible/focused. Idempotent — no body required.
 */
export async function POST() {
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
    .update({
      online: true,
      last_seen_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ ok: true });
}

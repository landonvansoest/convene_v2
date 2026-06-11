import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

/** Learner's own requests (active or archived). Mirrors public list shape where useful. */
export async function GET(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab");
  const isActive = tab !== "archived";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("requests")
    .select(
      "request_id, user_id, title, description, category_id, skills, response_count, created_at, is_active, is_public"
    )
    .eq("user_id", userId)
    .eq("is_active", isActive)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ requests: data ?? [] });
}

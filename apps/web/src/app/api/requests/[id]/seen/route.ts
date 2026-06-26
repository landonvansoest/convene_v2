import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Mark a community request as seen by the signed-in expert (For you unread state). */
export async function POST(_request: Request, { params }: Params) {
  const expertId = await getAuthedUserId();
  if (!expertId) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id: requestId } = await params;
  const admin = createAdminClient();

  const { data: reqRow, error: reqErr } = await admin
    .from("requests")
    .select("request_id, is_active, is_public")
    .eq("request_id", requestId)
    .maybeSingle();
  if (reqErr) return Response.json({ error: publicApiError(reqErr) }, { status: 500 });
  if (!reqRow?.is_public) {
    return Response.json({ error: "Request not found" }, { status: 404 });
  }

  const { error: insErr } = await admin.from("seen_requests").upsert(
    { request_id: requestId, expert_id: expertId, seen_at: new Date().toISOString() },
    { onConflict: "request_id,expert_id" },
  );
  if (insErr) return Response.json({ error: publicApiError(insErr) }, { status: 500 });

  return Response.json({ ok: true });
}

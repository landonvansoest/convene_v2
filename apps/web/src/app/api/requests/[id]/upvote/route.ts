import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Toggle an upvote on a community request. POST is the only verb — the
 * server figures out whether the caller already upvoted and flips the
 * state. Returns `{ upvoted, count }` so the client can render the
 * authoritative new state without a follow-up GET.
 *
 * Counter maintenance happens in a Postgres trigger
 * (`tg_request_upvotes_count`, migration 048) so even direct DB inserts
 * keep `requests.upvote_count` correct.
 */
export async function POST(_request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Sign in to upvote" }, { status: 401 });
  }

  const { id: requestId } = await params;

  const admin = createAdminClient();

  // Confirm the request exists and is publicly visible (you can only upvote
  // requests anyone can see). Owners can upvote their own request — harmless
  // and easier than reasoning about edge cases.
  const { data: reqRow, error: reqErr } = await admin
    .from("requests")
    .select("request_id, is_active, is_public")
    .eq("request_id", requestId)
    .maybeSingle();
  if (reqErr) return Response.json({ error: publicApiError(reqErr) }, { status: 500 });
  if (!reqRow || !reqRow.is_active || !reqRow.is_public) {
    return Response.json({ error: "Request not found" }, { status: 404 });
  }

  // Check current upvote state.
  const { data: existing, error: exErr } = await admin
    .from("request_upvotes")
    .select("request_id")
    .eq("request_id", requestId)
    .eq("user_id", userId)
    .maybeSingle();
  if (exErr) return Response.json({ error: publicApiError(exErr) }, { status: 500 });

  if (existing) {
    const { error: delErr } = await admin
      .from("request_upvotes")
      .delete()
      .eq("request_id", requestId)
      .eq("user_id", userId);
    if (delErr) return Response.json({ error: publicApiError(delErr) }, { status: 500 });
  } else {
    const { error: insErr } = await admin
      .from("request_upvotes")
      .insert({ request_id: requestId, user_id: userId });
    if (insErr) return Response.json({ error: publicApiError(insErr) }, { status: 500 });
  }

  const { data: after, error: afterErr } = await admin
    .from("requests")
    .select("upvote_count")
    .eq("request_id", requestId)
    .maybeSingle();
  if (afterErr) return Response.json({ error: publicApiError(afterErr) }, { status: 500 });

  return Response.json({
    upvoted: !existing,
    count: after?.upvote_count ?? 0,
  });
}

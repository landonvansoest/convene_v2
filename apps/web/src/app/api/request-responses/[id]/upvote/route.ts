import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Toggle an upvote on an expert response to a community request. POST only —
 * the server flips state based on whether the caller already upvoted.
 *
 * Rules (Bible):
 * - Caller must be signed in.
 * - Cannot upvote your own response (expert who wrote it).
 * - Counter maintenance via `tg_request_response_upvotes_count` (migration 055).
 */
export async function POST(_request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Sign in to upvote" }, { status: 401 });
  }

  const { id: responseId } = await params;
  const admin = createAdminClient();

  const { data: respRow, error: respErr } = await admin
    .from("request_responses")
    .select("response_id, expert_user_id, request_id, is_public")
    .eq("response_id", responseId)
    .maybeSingle();
  if (respErr) return Response.json({ error: publicApiError(respErr) }, { status: 500 });
  if (!respRow) {
    return Response.json({ error: "Response not found" }, { status: 404 });
  }

  if (respRow.expert_user_id === userId) {
    return Response.json({ error: "Cannot upvote your own response" }, { status: 400 });
  }
  if (respRow.is_public === false) {
    return Response.json({ error: "Private responses cannot be upvoted" }, { status: 400 });
  }

  const { data: reqRow, error: reqErr } = await admin
    .from("requests")
    .select("request_id, is_active, is_public, user_id")
    .eq("request_id", respRow.request_id)
    .maybeSingle();
  if (reqErr) return Response.json({ error: publicApiError(reqErr) }, { status: 500 });
  if (!reqRow?.is_active) {
    return Response.json({ error: "Response not found" }, { status: 404 });
  }
  const isOwner = userId === reqRow.user_id;
  if (!reqRow.is_public && !isOwner) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: existing, error: exErr } = await admin
    .from("request_response_upvotes")
    .select("response_id")
    .eq("response_id", responseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (exErr) return Response.json({ error: publicApiError(exErr) }, { status: 500 });

  if (existing) {
    const { error: delErr } = await admin
      .from("request_response_upvotes")
      .delete()
      .eq("response_id", responseId)
      .eq("user_id", userId);
    if (delErr) return Response.json({ error: publicApiError(delErr) }, { status: 500 });
  } else {
    const { error: insErr } = await admin
      .from("request_response_upvotes")
      .insert({ response_id: responseId, user_id: userId });
    if (insErr) return Response.json({ error: publicApiError(insErr) }, { status: 500 });
  }

  const { data: after, error: afterErr } = await admin
    .from("request_responses")
    .select("upvote_count")
    .eq("response_id", responseId)
    .maybeSingle();
  if (afterErr) return Response.json({ error: publicApiError(afterErr) }, { status: 500 });

  return Response.json({
    upvoted: !existing,
    count: after?.upvote_count ?? 0,
  });
}

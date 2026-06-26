import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { isUserOnlineFresh } from "@/lib/presence/online";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  message: z.string().min(1).max(8000),
  is_public: z.boolean().optional(),
});

export async function POST(request: Request, { params }: Params) {
  const expertUserId = await getAuthedUserId();
  if (!expertUserId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: requestId } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("expert_profiles")
    .select("user_id, expert_visibility_state")
    .eq("user_id", expertUserId)
    .maybeSingle();

  if (!profile || profile.expert_visibility_state !== "visible_active") {
    return Response.json({ error: "Active expert profile required" }, { status: 403 });
  }

  const { data: reqRow, error: reqErr } = await admin
    .from("requests")
    .select("request_id, user_id, is_active")
    .eq("request_id", requestId)
    .maybeSingle();

  if (reqErr) {
    return Response.json({ error: publicApiError(reqErr) }, { status: 500 });
  }
  if (!reqRow?.is_active) {
    return Response.json({ error: "Request not found or inactive" }, { status: 404 });
  }
  if (reqRow.user_id === expertUserId) {
    return Response.json({ error: "Cannot respond to your own request" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const isPublic = parsed.data.is_public ?? true;
  const { data: response, error: insErr } = await admin
    .from("request_responses")
    .insert({
      request_id: requestId,
      expert_user_id: expertUserId,
      message: parsed.data.message,
      is_public: isPublic,
      is_seen: false,
      upvote_count: 0,
      responded_at: now,
    })
    .select("*")
    .single();

  if (insErr) {
    return Response.json({ error: publicApiError(insErr) }, { status: 500 });
  }

  const nextCount = await admin
    .from("requests")
    .select("response_count")
    .eq("request_id", requestId)
    .maybeSingle();

  const count = (nextCount.data?.response_count ?? 0) + 1;
  await admin
    .from("requests")
    .update({ response_count: count, updated_at: now })
    .eq("request_id", requestId);

  return Response.json({ response }, { status: 201 });
}

export async function GET(_request: Request, { params }: Params) {
  const { id: requestId } = await params;
  const userId = await getAuthedUserId();

  const admin = createAdminClient();
  const { data: reqRow } = await admin
    .from("requests")
    .select("user_id, is_public, is_active, title, description")
    .eq("request_id", requestId)
    .maybeSingle();

  if (!reqRow) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const isOwner = userId === reqRow.user_id;
  if (!reqRow.is_public && !isOwner) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: responses, error } = await admin
    .from("request_responses")
    .select(
      "response_id, expert_user_id, message, is_public, is_seen, upvote_count, responded_at"
    )
    .eq("request_id", requestId)
    .order("responded_at", { ascending: false });

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const list = (responses ?? []).filter((r) => {
    if (r.is_public !== false) return true;
    if (!userId) return false;
    return userId === reqRow.user_id || userId === r.expert_user_id;
  });
  const expertIds = [...new Set(list.map((r) => r.expert_user_id))];
  type ExpertSnippetRow = {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    profile_photo: string | null;
    online: boolean | null;
    last_seen_at: string | null;
  };
  let expertById = new Map<string, ExpertSnippetRow>();
  let expertVisibilityById = new Map<string, string | null>();
  if (expertIds.length > 0) {
    const [{ data: users, error: uErr }, { data: profiles, error: pErr }] = await Promise.all([
      admin
        .from("users")
        .select("user_id, first_name, last_name, profile_photo, online, last_seen_at")
        .in("user_id", expertIds),
      admin
        .from("expert_profiles")
        .select("user_id, expert_visibility_state")
        .in("user_id", expertIds),
    ]);
    if (uErr) {
      return Response.json({ error: publicApiError(uErr) }, { status: 500 });
    }
    if (pErr) {
      return Response.json({ error: publicApiError(pErr) }, { status: 500 });
    }
    expertById = new Map(
      (users ?? []).map((u) => [u.user_id, u as ExpertSnippetRow]),
    );
    expertVisibilityById = new Map(
      (profiles ?? []).map((p) => [
        p.user_id,
        (p.expert_visibility_state as string | null) ?? null,
      ]),
    );
  }

  let upvotedResponseIds = new Set<string>();
  if (userId && list.length > 0) {
    const responseIds = list.map((r) => r.response_id);
    const { data: mine, error: upErr } = await admin
      .from("request_response_upvotes")
      .select("response_id")
      .eq("user_id", userId)
      .in("response_id", responseIds);
    if (upErr) {
      return Response.json({ error: publicApiError(upErr) }, { status: 500 });
    }
    upvotedResponseIds = new Set((mine ?? []).map((row) => String(row.response_id)));
  }

  const enriched = list.map((r) => {
    const u = expertById.get(r.expert_user_id) ?? null;
    const isOwnResponse = userId === r.expert_user_id;
    const isPublic = r.is_public !== false;
    return {
      ...r,
      is_public: isPublic,
      i_upvoted: upvotedResponseIds.has(String(r.response_id)),
      can_upvote: !!userId && !isOwnResponse && isPublic,
      expert: u
        ? {
            user_id: u.user_id,
            first_name: u.first_name,
            last_name: u.last_name,
            profile_photo: u.profile_photo,
            online: isUserOnlineFresh(u.online, u.last_seen_at),
            expert_visibility_state: expertVisibilityById.get(u.user_id) ?? null,
          }
        : null,
    };
  });

  let poster: {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    profile_photo: string | null;
  } | null = null;
  const { data: posterRow } = await admin
    .from("users")
    .select("user_id, first_name, last_name, profile_photo")
    .eq("user_id", reqRow.user_id)
    .maybeSingle();
  if (posterRow) {
    poster = posterRow;
  }

  return Response.json({
    responses: enriched,
    request: {
      request_id: requestId,
      user_id: reqRow.user_id,
      title: reqRow.title,
      description: reqRow.description,
    },
    poster,
  });
}

import { createAdminClient } from "@/lib/supabase/admin";
import { displayName, getAuthedUserId, getUsersByIds } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { buildSessionLiveTimingPayload } from "@/lib/sessionRoomLiveTiming";
import {
  fetchExpertVisibilityByUserIds,
  partnerExpertVisibilityState,
} from "@/lib/experts/fetchExpertVisibilityByUserIds";
import { isUserOnlineFresh } from "@/lib/presence/online";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: bookingId } = await params;
  const admin = createAdminClient();
  const { data: b, error } = await admin.from("bookings").select("*").eq("booking_id", bookingId).maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  if (!b) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }
  if (b.learner_user_id !== userId && b.expert_user_id !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const partnerId = b.learner_user_id === userId ? b.expert_user_id : b.learner_user_id;
  const bothUsers = await getUsersByIds([b.expert_user_id, b.learner_user_id]);
  const partner = bothUsers.find((u) => u.user_id === partnerId);
  const expertUser = bothUsers.find((u) => u.user_id === b.expert_user_id);
  const learnerUser = bothUsers.find((u) => u.user_id === b.learner_user_id);
  const expertVisibilityById = await fetchExpertVisibilityByUserIds(admin, [b.expert_user_id]);
  const expertVisibilityState = expertVisibilityById.get(b.expert_user_id) ?? null;

  const isLearner = b.learner_user_id === userId;
  const live_timing = await buildSessionLiveTimingPayload(
    admin,
    {
      booking_id: b.booking_id,
      expert_user_id: b.expert_user_id,
      learner_user_id: b.learner_user_id,
      session_date: String(b.session_date ?? ""),
      start_time: String(b.start_time ?? ""),
      end_time: String(b.end_time ?? ""),
      status: b.status as string | null,
      cancelled_at: b.cancelled_at as string | null,
      payment_status: b.payment_status as string | null,
      extensions: b.extensions as number | null,
    },
    isLearner,
  );
  const { data: viewerExpertReview } = isLearner
    ? await admin
        .from("reviews_of_experts")
        .select("review_id")
        .eq("booking_id", bookingId)
        .eq("learner_reviewer_id", userId)
        .maybeSingle()
    : { data: null };
  const { data: viewerLearnerReview } = !isLearner
    ? await admin
        .from("reviews_of_learners")
        .select("review_id")
        .eq("booking_id", bookingId)
        .eq("expert_reviewer_id", userId)
        .maybeSingle()
    : { data: null };
  const viewer_review_submitted = Boolean(isLearner ? viewerExpertReview : viewerLearnerReview);

  function party(
    u: NonNullable<typeof expertUser> | undefined,
    visibilityState: string | null = null,
  ): {
    user_id: string;
    display_name: string;
    profile_photo: string | null;
    profession: string | null;
    expert_visibility_state?: string | null;
  } | null {
    if (!u) return null;
    return {
      user_id: u.user_id,
      display_name: displayName(u),
      profile_photo: u.profile_photo ?? null,
      profession: u.profession?.trim() || null,
      ...(visibilityState != null ? { expert_visibility_state: visibilityState } : {}),
    };
  }

  return Response.json({
    booking: {
      ...b,
      id: b.booking_id,
      user_role: isLearner ? "learner" : "expert",
      partner_name: partner ? displayName(partner) : null,
      partner_photo: partner?.profile_photo ?? null,
      partner_online: isUserOnlineFresh(partner?.online, partner?.last_seen_at),
      partner_profession: partner?.profession?.trim() || null,
      partner_expert_visibility_state: partnerExpertVisibilityState(
        partnerId,
        partner?.has_expert_profile,
        expertVisibilityById,
      ),
      partner_id: partnerId,
    },
    expert: party(expertUser, expertVisibilityState),
    learner: party(learnerUser),
    viewer_review_submitted,
    live_timing,
  });
}

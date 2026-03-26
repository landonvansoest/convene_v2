import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type ActionItem = {
  id: string;
  label: string;
  href: string;
};

function avgOverall(rows: { overall_rating: number }[] | null): number | null {
  if (!rows?.length) return null;
  const sum = rows.reduce((s, r) => s + Number(r.overall_rating), 0);
  return Math.round((sum / rows.length) * 10) / 10;
}

function startOfUtcMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

/**
 * Aggregates dashboard overview + sidebar stats (Bible § Dashboard).
 */
export async function GET() {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = startOfUtcMonth();

  const [
    profileRes,
    expertRes,
    bookingsRes,
    convoRes,
    learnerReviewsRes,
    expertReviewsRes,
    txMonthRes,
    activeReqsRes,
  ] = await Promise.all([
    admin.from("users").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("expert_profiles").select("expert_profile_id, category_id, complete_sessions, expert_dependability_rating").eq("user_id", userId).maybeSingle(),
    admin
      .from("bookings")
      .select(
        "booking_id, expert_user_id, learner_user_id, session_date, start_time, status, payment_status"
      )
      .or(`learner_user_id.eq.${userId},expert_user_id.eq.${userId}`),
    admin.from("conversations").select("conversation_id").or(`expert_user_id.eq.${userId},learner_user_id.eq.${userId}`),
    admin.from("reviews_of_learners").select("overall_rating").eq("learner_reviewee_id", userId),
    admin.from("reviews_of_experts").select("overall_rating").eq("expert_reviewee_id", userId),
    admin
      .from("transactions")
      .select("expert_earnings, status")
      .eq("expert_user_id", userId)
      .gte("created_at", monthStart),
    admin.from("requests").select("request_id").eq("user_id", userId).eq("is_active", true),
  ]);

  if (profileRes.error) {
    return Response.json({ error: publicApiError(profileRes.error) }, { status: 500 });
  }
  const profile = profileRes.data;
  if (!profile) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }

  if (expertRes.error) {
    return Response.json({ error: publicApiError(expertRes.error) }, { status: 500 });
  }
  if (bookingsRes.error) {
    return Response.json({ error: publicApiError(bookingsRes.error) }, { status: 500 });
  }
  if (convoRes.error) {
    return Response.json({ error: publicApiError(convoRes.error) }, { status: 500 });
  }
  if (learnerReviewsRes.error) {
    return Response.json({ error: publicApiError(learnerReviewsRes.error) }, { status: 500 });
  }
  if (expertReviewsRes.error) {
    return Response.json({ error: publicApiError(expertReviewsRes.error) }, { status: 500 });
  }
  if (txMonthRes.error) {
    return Response.json({ error: publicApiError(txMonthRes.error) }, { status: 500 });
  }
  if (activeReqsRes.error) {
    return Response.json({ error: publicApiError(activeReqsRes.error) }, { status: 500 });
  }

  const bookings = bookingsRes.data ?? [];
  const expertProfile = profile.has_expert_profile ? expertRes.data : null;

  let unreadMessages = 0;
  const conversationIds = (convoRes.data ?? []).map((c) => c.conversation_id);
  if (conversationIds.length) {
    const { data: unreadRows, error: unreadErr } = await admin
      .from("messages")
      .select("message_id")
      .in("conversation_id", conversationIds)
      .eq("is_read", false)
      .neq("sender_id", userId);
    if (unreadErr) {
      return Response.json({ error: publicApiError(unreadErr) }, { status: 500 });
    }
    unreadMessages = unreadRows?.length ?? 0;
  }

  const upcomingSessions = bookings.filter(
    (b) =>
      b.status === "upcoming" &&
      b.payment_status === "paid" &&
      String(b.session_date) >= today
  );

  const upcomingSessionCount = upcomingSessions.length;

  const expertNewBookings = bookings.filter(
    (b) =>
      b.expert_user_id === userId &&
      b.status === "upcoming" &&
      b.payment_status !== "paid"
  ).length;

  const learnerPendingPayment = bookings.filter(
    (b) =>
      b.learner_user_id === userId &&
      b.status === "upcoming" &&
      b.payment_status !== "paid"
  ).length;

  const sessionsToday = bookings.filter(
    (b) => String(b.session_date) === today && b.status === "upcoming"
  ).length;

  let learnerUnseenRequestResponses = 0;
  const activeRequestIds = (activeReqsRes.data ?? []).map((r) => r.request_id);
  if (activeRequestIds.length) {
    const { count, error: rrErr } = await admin
      .from("request_responses")
      .select("*", { count: "exact", head: true })
      .in("request_id", activeRequestIds)
      .eq("is_seen", false);
    if (rrErr) {
      return Response.json({ error: publicApiError(rrErr) }, { status: 500 });
    }
    learnerUnseenRequestResponses = count ?? 0;
  }

  let expertCommunityRequests = 0;
  if (expertProfile?.category_id) {
    const { data: archived, error: archErr } = await admin
      .from("archived_requests")
      .select("request_id")
      .eq("expert_id", userId);
    if (archErr) {
      return Response.json({ error: publicApiError(archErr) }, { status: 500 });
    }
    const archivedSet = new Set((archived ?? []).map((a) => a.request_id));

    const { data: catReqs, error: crErr } = await admin
      .from("requests")
      .select("request_id")
      .eq("category_id", expertProfile.category_id)
      .eq("is_active", true)
      .eq("is_public", true);
    if (crErr) {
      return Response.json({ error: publicApiError(crErr) }, { status: 500 });
    }
    expertCommunityRequests = (catReqs ?? []).filter((r) => !archivedSet.has(r.request_id)).length;
  }

  const earningsThisMonth = (txMonthRes.data ?? [])
    .filter((t) => t.status === "succeeded")
    .reduce((s, t) => s + Number(t.expert_earnings ?? 0), 0);

  const actionItems: ActionItem[] = [];
  if (sessionsToday > 0) {
    actionItems.push({
      id: "today",
      label:
        sessionsToday === 1
          ? "You have a session scheduled today."
          : `You have ${sessionsToday} sessions scheduled today.`,
      href: "/dashboard?view=sessions",
    });
  }
  if (expertNewBookings > 0) {
    actionItems.push({
      id: "expert-bookings",
      label:
        expertNewBookings === 1
          ? "1 booking needs your approval or payment confirmation."
          : `${expertNewBookings} bookings need your approval or payment confirmation.`,
      href: "/dashboard?view=sessions",
    });
  }
  if (learnerPendingPayment > 0) {
    actionItems.push({
      id: "learner-pay",
      label:
        learnerPendingPayment === 1
          ? "Complete payment for a pending booking."
          : `Complete payment for ${learnerPendingPayment} pending bookings.`,
      href: "/dashboard?view=sessions",
    });
  }
  if (unreadMessages > 0) {
    actionItems.push({
      id: "unread",
      label:
        unreadMessages === 1
          ? "You have 1 unread message."
          : `You have ${unreadMessages} unread messages.`,
      href: "/dashboard?view=inbox",
    });
  }
  if (learnerUnseenRequestResponses > 0 && !profile.has_expert_profile) {
    actionItems.push({
      id: "request-responses",
      label:
        learnerUnseenRequestResponses === 1
          ? "1 new expert response to your request."
          : `${learnerUnseenRequestResponses} new expert responses to your requests.`,
      href: "/dashboard?view=requests",
    });
  }

  const firstName = (profile.first_name ?? "").trim();
  const lastName = (profile.last_name ?? "").trim();

  return Response.json({
    profile: {
      firstName,
      lastName,
      email: profile.email_address ?? "",
      profilePhoto: profile.profile_photo ?? null,
      online: Boolean(profile.online),
      sessionsBooked: profile.sessions_booked ?? 0,
      sessionsCompleted: profile.sessions_completed ?? 0,
      learnerDependabilityRating: profile.learner_dependability_rating ?? null,
      hasExpertProfile: Boolean(profile.has_expert_profile),
    },
    expert: expertProfile
      ? {
          expertProfileId: expertProfile.expert_profile_id,
          completeSessions: expertProfile.complete_sessions ?? 0,
          expertDependabilityRating: expertProfile.expert_dependability_rating ?? null,
          categoryId: expertProfile.category_id ?? null,
        }
      : null,
    ratings: {
      asLearnerAvg: avgOverall(learnerReviewsRes.data),
      asExpertAvg: avgOverall(expertReviewsRes.data),
    },
    counts: {
      upcomingSessions: upcomingSessionCount,
      unreadMessages,
      expertNewBookings,
      learnerUnseenRequestResponses,
      expertCommunityRequests,
    },
    earningsThisMonth,
    actionItems,
  });
}

import { createAdminClient } from "@/lib/supabase/admin";
import {
  bookingPaymentIsSettled,
  hasSessionEndedByWallClock,
  sessionWallClockInstant,
} from "@/lib/sessionWallClock";
import {
  BOOKING_SELECT_FOR_METRICS,
  fetchRescheduleMessagesForBookings,
  summarizeExpertBookingMetrics,
  summarizeLearnerBookingMetrics,
} from "@/lib/bookingMetrics";
import { publicApiError } from "@/lib/api/public-error";
import { displayName, getUsersByIds } from "@/lib/messages/service";
import { fetchExpertVisibilityByUserIds, partnerExpertVisibilityState } from "@/lib/experts/fetchExpertVisibilityByUserIds";
import { isUserOnlineFresh } from "@/lib/presence/online";
import type { DashboardSummaryJson } from "@/app/dashboard/DashboardOverview";

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

/** YYYY-MM-DD in the server/local timezone (matches wall-clock session cards). */
function localCalendarDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatSessionTimeLabel(sessionDate: string, time: unknown): string {
  const inst = sessionWallClockInstant(sessionDate, time as string | null | undefined);
  if (!inst) return "—";
  return inst.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export type DashboardSummaryResult =
  | { ok: true; data: DashboardSummaryJson }
  | { ok: false; error: string; status: number };

/**
 * Shared implementation for GET /api/me/dashboard-summary and server-rendered dashboard bootstrap.
 */
export async function buildDashboardSummaryForUser(userId: string): Promise<DashboardSummaryResult> {
  const admin = createAdminClient();
  const today = localCalendarDateString(new Date());
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
    admin
      .from("expert_profiles")
      .select(
        "expert_profile_id, category_id, complete_sessions, expert_dependability_rating, expert_visibility_state",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("bookings")
      .select(BOOKING_SELECT_FOR_METRICS)
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
    return { ok: false, error: publicApiError(profileRes.error), status: 500 };
  }
  const profile = profileRes.data;
  if (!profile) {
    return { ok: false, error: "Profile not found", status: 404 };
  }

  if (expertRes.error) {
    return { ok: false, error: publicApiError(expertRes.error), status: 500 };
  }
  if (bookingsRes.error) {
    return { ok: false, error: publicApiError(bookingsRes.error), status: 500 };
  }
  if (convoRes.error) {
    return { ok: false, error: publicApiError(convoRes.error), status: 500 };
  }
  if (learnerReviewsRes.error) {
    return { ok: false, error: publicApiError(learnerReviewsRes.error), status: 500 };
  }
  if (expertReviewsRes.error) {
    return { ok: false, error: publicApiError(expertReviewsRes.error), status: 500 };
  }
  if (txMonthRes.error) {
    return { ok: false, error: publicApiError(txMonthRes.error), status: 500 };
  }
  if (activeReqsRes.error) {
    return { ok: false, error: publicApiError(activeReqsRes.error), status: 500 };
  }

  const bookings = bookingsRes.data ?? [];
  const expertProfile = profile.has_expert_profile ? expertRes.data : null;

  const learnerBookingRows = bookings.filter((b) => b.learner_user_id === userId);
  const expertBookingRows = bookings.filter((b) => b.expert_user_id === userId);
  const dependabilityRescheduleMap = await fetchRescheduleMessagesForBookings(admin, bookings);
  const learnerBookingMetrics = summarizeLearnerBookingMetrics(learnerBookingRows, dependabilityRescheduleMap);
  const expertBookingMetrics = summarizeExpertBookingMetrics(expertBookingRows, dependabilityRescheduleMap);

  let unreadMessages = 0;
  const conversationIds = (convoRes.data ?? []).map((c) => c.conversation_id);
  if (conversationIds.length) {
    const { count, error: unreadErr } = await admin
      .from("messages")
      .select("message_id", { count: "exact", head: true })
      .in("conversation_id", conversationIds)
      .eq("is_read", false)
      .neq("sender_id", userId);
    if (unreadErr) {
      return { ok: false, error: publicApiError(unreadErr), status: 500 };
    }
    unreadMessages = count ?? 0;
  }

  const upcomingSessions = bookings.filter((b) => {
    if (b.status !== "upcoming" || !bookingPaymentIsSettled(b.payment_status)) return false;
    if (String(b.session_date) < today) return false;
    if (hasSessionEndedByWallClock(String(b.session_date ?? ""), b.end_time as string | null | undefined)) {
      return false;
    }
    return true;
  });

  const upcomingSessionCount = upcomingSessions.length;

  /** Expert attention: unpaid / incomplete payment (including default `pending` until learner pays). */
  const expertNewBookings = bookings.filter((b) => {
    if (b.expert_user_id !== userId || b.status !== "upcoming") return false;
    const ps = String(b.payment_status ?? "").toLowerCase();
    if (ps === "refunded") return false;
    if (bookingPaymentIsSettled(b.payment_status)) return false;
    if (hasSessionEndedByWallClock(String(b.session_date ?? ""), b.end_time as string | null | undefined)) {
      return false;
    }
    return true;
  }).length;

  const learnerPendingPayment = bookings.filter(
    (b) =>
      b.learner_user_id === userId &&
      b.status === "upcoming" &&
      String(b.payment_status ?? "").toLowerCase() === "failed",
  ).length;

  /** Learner: unpaid instant checkout (`pending`). Omitted from `/api/sessions` default list but needs attention. */
  const learnerUnpaidCardBookings = bookings.filter((b) => {
    if (b.learner_user_id !== userId || b.status !== "upcoming") return false;
    if (String(b.payment_status ?? "").toLowerCase() !== "pending") return false;
    if (hasSessionEndedByWallClock(String(b.session_date ?? ""), b.end_time as string | null | undefined)) {
      return false;
    }
    return true;
  }).length;

  const sessionsToday = bookings.filter(
    (b) => String(b.session_date) === today && b.status === "upcoming",
  ).length;

  const todayPaidSessions = bookings
    .filter((b) => {
      if (String(b.session_date) !== today) return false;
      if (b.status !== "upcoming") return false;
      if (!bookingPaymentIsSettled(b.payment_status)) return false;
      if (hasSessionEndedByWallClock(String(b.session_date ?? ""), b.end_time as string | null | undefined)) {
        return false;
      }
      return true;
    })
    .map((b) => {
      const sessionDate = String(b.session_date ?? "");
      const start = sessionWallClockInstant(sessionDate, b.start_time as string | null | undefined);
      return {
        bookingId: String(b.booking_id),
        sessionDate,
        start,
        startTime: b.start_time,
        endTime: b.end_time,
        expertUserId: String(b.expert_user_id ?? ""),
        learnerUserId: String(b.learner_user_id ?? ""),
      };
    })
    .filter((row): row is typeof row & { start: Date } => row.start !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const uniqPartnerIds =
    todayPaidSessions.length === 0 ?
      []
    : [...new Set(
        todayPaidSessions
          .map((r) => (r.learnerUserId === userId ? r.expertUserId : r.learnerUserId))
          .filter((id): id is string => Boolean(id)),
      )];

  const partnerUsers = uniqPartnerIds.length > 0 ? await getUsersByIds(uniqPartnerIds) : [];
  const partnerById = new Map(partnerUsers.map((u) => [u.user_id, u]));
  const expertPartnerIds = partnerUsers.filter((u) => u.has_expert_profile).map((u) => u.user_id);
  const expertVisibilityById = await fetchExpertVisibilityByUserIds(admin, expertPartnerIds);

  const todayPaidSessionRows = todayPaidSessions.map((row) => {
    const partnerId = row.learnerUserId === userId ? row.expertUserId : row.learnerUserId;
    const p = partnerId ? partnerById.get(partnerId) : undefined;
    return {
      bookingId: row.bookingId,
      partnerName: p ? displayName(p) : "Session partner",
      partnerPhoto: p?.profile_photo ?? null,
      partnerExpertVisibilityState: partnerExpertVisibilityState(
        partnerId,
        p?.has_expert_profile,
        expertVisibilityById,
      ),
      startTimeLabel: formatSessionTimeLabel(row.sessionDate, row.startTime),
      rangeLabel: `${formatSessionTimeLabel(row.sessionDate, row.startTime)} – ${formatSessionTimeLabel(row.sessionDate, row.endTime)}`,
    };
  });

  const nowMs = Date.now();
  const nextUpcomingRow = todayPaidSessions.find((r) => r.start.getTime() > nowMs);

  let nextStartsInMinutes: number | null = null;
  let nextSessionStartsAtMs: number | null = null;
  if (nextUpcomingRow) {
    nextSessionStartsAtMs = nextUpcomingRow.start.getTime();
    nextStartsInMinutes = Math.max(0, Math.ceil((nextUpcomingRow.start.getTime() - nowMs) / 60_000));
  }

  let nextSession: {
    bookingId: string;
    partnerName: string;
    partnerPhoto: string | null;
    startTimeLabel: string;
  } | null = null;
  if (nextUpcomingRow) {
    const rowData = todayPaidSessionRows.find((r) => r.bookingId === nextUpcomingRow.bookingId);
    nextSession =
      rowData ?
        {
          bookingId: rowData.bookingId,
          partnerName: rowData.partnerName,
          partnerPhoto: rowData.partnerPhoto,
          startTimeLabel: rowData.startTimeLabel,
        }
      : null;
  }

  const sessionsTodayPreview: DashboardSummaryJson["sessionsTodayPreview"] =
    todayPaidSessions.length > 0 ?
      {
        nextStartsInMinutes,
        nextSessionStartsAtMs,
        ...(nextSession ? { nextSession } : {}),
        todayPaidSessionRows,
      }
    : null;

  let learnerUnseenRequestResponses = 0;
  const activeRequestIds = (activeReqsRes.data ?? []).map((r) => r.request_id);
  if (activeRequestIds.length) {
    const { count, error: rrErr } = await admin
      .from("request_responses")
      .select("*", { count: "exact", head: true })
      .in("request_id", activeRequestIds)
      .eq("is_seen", false);
    if (rrErr) {
      return { ok: false, error: publicApiError(rrErr), status: 500 };
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
      return { ok: false, error: publicApiError(archErr), status: 500 };
    }
    const archivedSet = new Set((archived ?? []).map((a) => a.request_id));

    const { data: catReqs, error: crErr } = await admin
      .from("requests")
      .select("request_id")
      .eq("category_id", expertProfile.category_id)
      .eq("is_active", true)
      .eq("is_public", true);
    if (crErr) {
      return { ok: false, error: publicApiError(crErr), status: 500 };
    }
    expertCommunityRequests = (catReqs ?? []).filter((r) => !archivedSet.has(r.request_id)).length;
  }

  const earningsThisMonth = (txMonthRes.data ?? [])
    .filter((t) => t.status === "succeeded")
    .reduce((s, t) => s + Number(t.expert_earnings ?? 0), 0);

  const actionItems: ActionItem[] = [];
  if (sessionsToday > 0 && todayPaidSessions.length === 0) {
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
  if (learnerUnpaidCardBookings > 0) {
    actionItems.push({
      id: "learner-card-pending",
      label:
        learnerUnpaidCardBookings === 1
          ? "Finish paying for your session checkout."
          : `${learnerUnpaidCardBookings} bookings need payment to confirm.`,
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

  const data: DashboardSummaryJson = {
    profile: {
      firstName,
      lastName,
      email: profile.email_address ?? "",
      profilePhoto: profile.profile_photo ?? null,
      online: isUserOnlineFresh(
        profile.online,
        (profile as { last_seen_at?: string | null }).last_seen_at,
      ),
      sessionsBooked: profile.sessions_booked ?? 0,
      sessionsCompleted: learnerBookingMetrics.completedSessionCount,
      // Bible §"Dependability Rating": prefer the persisted rolling average
      // (lib/dependability-persist.ts + migration 043 keep this live across
      // completed AND cancelled bookings, per Bible). The on-the-fly average
      // is a backwards-compatible fallback for users whose scores predate
      // the persistence layer.
      learnerDependabilityRating:
        (profile.learner_dependability_rating as number | null) ??
        learnerBookingMetrics.avgLearnerDependability ??
        null,
      hasExpertProfile: Boolean(profile.has_expert_profile),
      conveneRoleMode: profile.convene_role_mode ?? "learner",
    },
    expert: expertProfile
      ? {
          expertProfileId: expertProfile.expert_profile_id,
          completeSessions: expertBookingMetrics.completedSessionCount,
          expertDependabilityRating:
            (expertProfile.expert_dependability_rating as number | null) ??
            expertBookingMetrics.avgExpertDependability ??
            null,
          categoryId: expertProfile.category_id ?? null,
          expertVisibilityState:
            (expertProfile.expert_visibility_state as string | null) ?? null,
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
      learnerUnpaidCardBookings,
      learnerUnseenRequestResponses,
      expertCommunityRequests,
    },
    earningsThisMonth,
    actionItems,
    sessionsTodayPreview,
  };

  return { ok: true, data };
}

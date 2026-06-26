import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import {
  computeAvailableNow,
  computeBookingWeekPreview,
  computeNextAvailableSummary,
  bookingPreviewSessionDates,
} from "@/lib/expertBookingPreview";
import { fetchExpertBlockingIntervals } from "@/lib/expert-booking-blocks";
import {
  bucketBookingsByExpertUserId,
  BOOKING_SELECT_FOR_METRICS,
  fetchRescheduleMessagesForBookings,
  summarizeExpertBookingMetrics,
  type BookingRowWithExpertId,
} from "@/lib/bookingMetrics";
import { isUserOnlineFresh } from "@/lib/presence/online";
import { getAuthedUserId } from "@/lib/messages/service";
import { learnerHasPaidSessionWithExpert } from "@/lib/pricing/first-session-discount";
import { refreshStaleDependabilityForBookings } from "@/lib/dependability-persist";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: profile, error: profileErr } = await admin
    .from("expert_profiles")
    .select("*")
    .eq("user_id", id)
    .maybeSingle();
  if (profileErr) return Response.json({ error: publicApiError(profileErr) }, { status: 500 });
  if (!profile) return Response.json({ error: "Expert not found" }, { status: 404 });

  const { data: user, error: userErr } = await admin
    .from("users")
    .select(
      "user_id, first_name, last_name, profile_photo, email_address, profession, hometown, online, last_seen_at, time_zone",
    )
    .eq("user_id", id)
    .maybeSingle();
  if (userErr) return Response.json({ error: publicApiError(userErr) }, { status: 500 });
  if (!user) return Response.json({ error: "Expert not found" }, { status: 404 });

  let category_name: string | null = null;
  if (profile.category_id) {
    const { data: cat } = await admin
      .from("categories")
      .select("name")
      .eq("category_id", profile.category_id)
      .maybeSingle();
    category_name = cat?.name ?? null;
  }

  const { data: availability } = await admin
    .from("expert_availability")
    .select(
      "rate, available_now, available_until, minimum_booking, maximum_booking, minimum_notice, maximum_notice, buffer_time, weekly_schedule, availability_overrides, calendar_paused, auto_accept, first_session_discount_enabled, first_session_discount_max_session_minutes, first_session_discount_effective_from, first_session_discount_effective_until, first_session_discount_type, first_session_discount_value, package_deal_enabled, package_session_count, package_session_duration_minutes, package_require_purchase, package_require_purchase_after_first_session, package_discount_type, package_discount_value",
    )
    .eq("user_id", id)
    .maybeSingle();

  const { data: responseStats } = await admin
    .from("expert_response_time_stats")
    .select("response_interval_count, total_response_time_seconds")
    .eq("expert_id", id)
    .maybeSingle();

  const { data: selfBookingMetricRows } = await admin
    .from("bookings")
    .select(BOOKING_SELECT_FOR_METRICS)
    .eq("expert_user_id", id);
  const selfRows = selfBookingMetricRows ?? [];
  await refreshStaleDependabilityForBookings(admin, selfRows);
  const selfRescheduleMap = await fetchRescheduleMessagesForBookings(admin, selfRows);
  const selfExpertMetrics = summarizeExpertBookingMetrics(selfRows, selfRescheduleMap);

  const [{ count: rawTotal }, { count: rawCancelled }] = await Promise.all([
    admin
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("expert_user_id", id),
    admin
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("expert_user_id", id)
      .eq("status", "cancelled"),
  ]);
  const totalBookings = rawTotal ?? 0;
  const cancelledBookings = rawCancelled ?? 0;
  const cancellationRate =
    totalBookings > 0 ? Math.round((cancelledBookings / totalBookings) * 100) : null;

  const { data: reviewStats } = await admin
    .from("reviews_of_experts")
    .select("questions_rating, knowledgeable_rating, personable_rating")
    .eq("expert_reviewee_id", id);

  const ratingAverages = (() => {
    const rows = reviewStats ?? [];
    const avgFor = (key: "questions_rating" | "knowledgeable_rating" | "personable_rating") => {
      const vals = rows.map((r) => Number(r[key])).filter((n) => Number.isFinite(n) && n > 0);
      if (!vals.length) return null;
      return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    };
    return {
      impact: avgFor("questions_rating"),
      knowledge: avgFor("knowledgeable_rating"),
      personable: avgFor("personable_rating"),
    };
  })();

  let performanceHighlights:
    | {
        impact_rating_avg: number | null;
        knowledgeable_rating_avg: number | null;
        personable_rating_avg: number | null;
        sessions_complete: number;
        cancellation_rate: number | null;
        reliability_score: number;
        is_most_impactful: boolean;
        is_most_knowledgeable: boolean;
        is_most_personable: boolean;
        is_most_booked: boolean;
        is_least_cancellations: boolean;
        is_most_reliable: boolean;
      }
    | null = null;

  if (profile.category_id) {
    const { data: peers } = await admin
      .from("expert_profiles")
      .select("user_id")
      .eq("category_id", profile.category_id);

    const peerIds = (peers ?? []).map((p) => String(p.user_id));
    const categoryPeers = peerIds.length > 0 ? peerIds : [id];

    const [peerBookingsRes, peerReviewsRes] = await Promise.all([
      admin.from("bookings").select(BOOKING_SELECT_FOR_METRICS).in("expert_user_id", categoryPeers),
      admin
        .from("reviews_of_experts")
        .select("expert_reviewee_id, questions_rating, knowledgeable_rating, personable_rating")
        .in("expert_reviewee_id", categoryPeers),
    ]);

    const peerRows = peerBookingsRes.data ?? [];

    const bookingsByExpert = new Map<string, { total: number; cancelled: number }>();
    for (const pid of categoryPeers) bookingsByExpert.set(pid, { total: 0, cancelled: 0 });
    for (const b of peerRows) {
      const key = String(b.expert_user_id);
      const row = bookingsByExpert.get(key) ?? { total: 0, cancelled: 0 };
      row.total += 1;
      if (String(b.status) === "cancelled") row.cancelled += 1;
      bookingsByExpert.set(key, row);
    }

    const reviewsByExpert = new Map<
      string,
      { impact: number[]; knowledge: number[]; personable: number[] }
    >();
    for (const pid of categoryPeers) reviewsByExpert.set(pid, { impact: [], knowledge: [], personable: [] });
    for (const r of peerReviewsRes.data ?? []) {
      const key = String(r.expert_reviewee_id);
      const row = reviewsByExpert.get(key) ?? { impact: [], knowledge: [], personable: [] };
      const q = Number(r.questions_rating);
      const k = Number(r.knowledgeable_rating);
      const p = Number(r.personable_rating);
      if (Number.isFinite(q) && q > 0) row.impact.push(q);
      if (Number.isFinite(k) && k > 0) row.knowledge.push(k);
      if (Number.isFinite(p) && p > 0) row.personable.push(p);
      reviewsByExpert.set(key, row);
    }

    const peerRescheduleMap = await fetchRescheduleMessagesForBookings(admin, peerRows);

    const byExpert = bucketBookingsByExpertUserId(peerRows as BookingRowWithExpertId[]);
    const sessionCounts = categoryPeers.map(
      (pid) =>
        summarizeExpertBookingMetrics(byExpert.get(pid) ?? [], peerRescheduleMap).completedSessionCount,
    );

    const cancellationRates = categoryPeers
      .map((pid) => {
        const s = bookingsByExpert.get(pid);
        if (!s || s.total === 0) return null;
        return (s.cancelled / s.total) * 100;
      })
      .filter((v): v is number => v != null);

    const quantile = (values: number[], p: number) => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
      return sorted[idx];
    };

    const currentSessions = selfExpertMetrics.completedSessionCount;
    // Prefer the persisted rolling average (migration 043 keeps this live
    // across completed AND cancelled bookings, per Bible §"Dependability Rating").
    const currentReliability =
      Number(selfExpertMetrics.avgExpertDependability ?? profile.expert_dependability_rating ?? 0);
    const currentCancellation = cancellationRate;

    const top60SessionsThreshold = quantile(sessionCounts, 0.4);
    const low40CancellationThreshold = quantile(cancellationRates, 0.4);

    performanceHighlights = {
      impact_rating_avg: ratingAverages.impact,
      knowledgeable_rating_avg: ratingAverages.knowledge,
      personable_rating_avg: ratingAverages.personable,
      sessions_complete: currentSessions,
      cancellation_rate: currentCancellation,
      reliability_score: currentReliability,
      is_most_impactful: ratingAverages.impact != null && ratingAverages.impact > 4,
      is_most_knowledgeable: ratingAverages.knowledge != null && ratingAverages.knowledge > 4,
      is_most_personable: ratingAverages.personable != null && ratingAverages.personable > 4,
      is_most_booked: top60SessionsThreshold != null && currentSessions >= top60SessionsThreshold,
      is_least_cancellations:
        currentCancellation != null &&
        low40CancellationThreshold != null &&
        currentCancellation <= low40CancellationThreshold,
      is_most_reliable: currentReliability > 90,
    };
  }

  const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.email_address;
  const tz = (user as { time_zone?: string | null }).time_zone ?? null;
  const previewDates = bookingPreviewSessionDates(availability, tz);
  const blockingIntervals = await fetchExpertBlockingIntervals(admin, id, previewDates);
  const booking_week_preview = computeBookingWeekPreview(availability, tz, new Date(), {
    blockingIntervals,
  });
  const next_available_summary = computeNextAvailableSummary(availability, tz, new Date(), blockingIntervals);
  const { availableNow, availableUntil } = computeAvailableNow(availability, tz, new Date(), blockingIntervals);

  const viewerUserId = await getAuthedUserId();
  let viewerHasPaidSessionWithExpert = false;
  if (viewerUserId && viewerUserId !== id) {
    viewerHasPaidSessionWithExpert = await learnerHasPaidSessionWithExpert(admin, id, viewerUserId);
  }

  return Response.json({
    expert: {
      id: user.user_id,
      name,
      profile_photo: user.profile_photo,
      email: user.email_address,
      profession: user.profession,
      hometown: user.hometown,
      online: isUserOnlineFresh(
        user.online,
        (user as { last_seen_at?: string | null }).last_seen_at,
      ),
      time_zone: tz,
      category_name,
      ...profile,
      complete_sessions: selfExpertMetrics.completedSessionCount,
      expert_dependability_rating:
        selfExpertMetrics.avgExpertDependability ?? profile.expert_dependability_rating ?? null,
      membership_tier: (profile as { membership_tier?: string | null }).membership_tier ?? "free",
      is_verified:
        ((profile as { membership_tier?: string | null }).membership_tier ?? "free") !== "free",
      ...(availability
        ? {
            rate: availability.rate,
            available_now: availableNow,
            available_until: availableUntil,
            minimum_booking: availability.minimum_booking,
            maximum_booking: availability.maximum_booking,
            minimum_notice: availability.minimum_notice,
            maximum_notice: availability.maximum_notice,
            buffer_time: availability.buffer_time,
            weekly_schedule: availability.weekly_schedule,
            availability_overrides: availability.availability_overrides,
            calendar_paused: availability.calendar_paused,
            auto_accept: availability.auto_accept,
            first_session_discount_enabled: availability.first_session_discount_enabled,
            first_session_discount_max_session_minutes:
              availability.first_session_discount_max_session_minutes,
            first_session_discount_effective_from: availability.first_session_discount_effective_from,
            first_session_discount_effective_until: availability.first_session_discount_effective_until,
            first_session_discount_type: availability.first_session_discount_type,
            first_session_discount_value: availability.first_session_discount_value,
            package_deal_enabled: availability.package_deal_enabled,
            package_session_count: availability.package_session_count,
            package_session_duration_minutes: availability.package_session_duration_minutes,
            package_require_purchase: availability.package_require_purchase,
            package_require_purchase_after_first_session:
              availability.package_require_purchase_after_first_session,
            package_discount_type: availability.package_discount_type,
            package_discount_value: availability.package_discount_value,
          }
        : {}),
      expert_profile_id: profile.expert_profile_id,
      booking_week_preview,
      booking_blocking_intervals: blockingIntervals,
      next_available_summary,
      cancellation_rate: cancellationRate,
      performance_highlights: performanceHighlights,
      ...(responseStats
        ? {
            response_interval_count: responseStats.response_interval_count,
            total_response_time_seconds: responseStats.total_response_time_seconds,
          }
        : {}),
      viewer_has_paid_session_with_expert: viewerHasPaidSessionWithExpert,
    },
  });
}

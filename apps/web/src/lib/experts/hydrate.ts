import type { createAdminClient } from "@/lib/supabase/admin";
import {
  computeAvailableNow,
  computeNextAvailableSummary,
  computeNextBookableSlots,
} from "@/lib/expertBookingPreview";
import {
  BOOKING_SELECT_FOR_METRICS,
  bucketBookingsByExpertUserId,
  fetchRescheduleMessagesForBookings,
  summarizeExpertBookingMetrics,
  type BookingRowWithExpertId,
} from "@/lib/bookingMetrics";
import { isUserOnlineFresh } from "@/lib/presence/online";

/**
 * Shape returned by GET /api/experts and POST /api/search/experts. The two
 * routes must stay in lockstep so the same components (search results card,
 * featured grid, browse page, dashboard suggestions) can consume either.
 */
export type HydratedExpert = {
  id: string;
  name: string;
  profile_photo: string | null;
  professional_title: string;
  category_id: string | null;
  category_name: string | null;
  skills: string[];
  rating: number | null;
  reviews_count: number;
  completed_sessions: number;
  bio: string | null;
  rate_per_15_min: number;
  online: boolean;
  language: string | null;
  time_zone: string | null;
  available_now: boolean;
  available_until: string | null;
  next_available_summary: string | null;
  next_bookable_slots: {
    display_date: string;
    display_time: string;
    start_utc: string;
    end_utc: string;
  }[];
  membership_tier: string;
  is_verified: boolean;
  first_session_discount_available: boolean;
  packages_available: boolean;
  expert_visibility_state: string | null;
};

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Hydrate a list of expert user_ids (in caller-defined order) into the full
 * HydratedExpert shape. Used by the search route after FTS/RRF returns a
 * ranked id list — we preserve that order so the UI shows expert #1 first.
 *
 * Returns rows for the ids that resolved successfully; ids with missing
 * users/expert_profiles rows are silently dropped (consistent with the
 * existing /api/experts behavior).
 */
export async function hydrateExperts(
  admin: Admin,
  userIds: string[],
): Promise<HydratedExpert[]> {
  if (userIds.length === 0) return [];

  const { data: expertRows, error: expertErr } = await admin
    .from("expert_profiles")
    .select(
      "user_id, category_id, qualifications, expert_bio, skills_specializations, membership_tier, expert_visibility_state",
    )
    .in("user_id", userIds);
  if (expertErr) throw expertErr;
  const expertByUserId = new Map((expertRows ?? []).map((e) => [e.user_id, e]));

  const { data: users, error: userErr } = await admin
    .from("users")
    .select(
      "user_id, first_name, last_name, profile_photo, email_address, profession, online, last_seen_at, language, time_zone",
    )
    .in("user_id", userIds);
  if (userErr) throw userErr;
  const userByUserId = new Map((users ?? []).map((u) => [u.user_id, u]));

  const categoryIds = [
    ...new Set(
      (expertRows ?? [])
        .map((e) => e.category_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  let categoryNameById = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: cats, error: catErr } = await admin
      .from("categories")
      .select("category_id, name")
      .in("category_id", categoryIds);
    if (catErr) throw catErr;
    categoryNameById = new Map((cats ?? []).map((c) => [c.category_id, c.name]));
  }

  const { data: availability, error: availErr } = await admin
    .from("expert_availability")
    .select(
      "user_id, rate, available_now, available_until, first_session_discount_enabled, weekly_schedule, availability_overrides, calendar_paused, minimum_notice, maximum_notice, minimum_booking, buffer_time",
    )
    .in("user_id", userIds);
  if (availErr) throw availErr;
  const availById = new Map((availability ?? []).map((a) => [a.user_id, a as Record<string, unknown>]));

  const { data: packageRows, error: packageErr } = await admin
    .from("expert_packages")
    .select("expert_user_id")
    .in("expert_user_id", userIds)
    .eq("is_published", true)
    .eq("status", "active");
  if (packageErr) throw packageErr;
  const expertsWithPackages = new Set<string>();
  for (const p of packageRows ?? []) {
    expertsWithPackages.add(p.expert_user_id as string);
  }

  const { data: reviewRows, error: reviewErr } = await admin
    .from("reviews_of_experts")
    .select("expert_reviewee_id, overall_rating")
    .in("expert_reviewee_id", userIds);
  if (reviewErr) throw reviewErr;
  const reviewAcc = new Map<string, { s: number; n: number }>();
  for (const r of reviewRows ?? []) {
    const id = r.expert_reviewee_id as string;
    const v = Number(r.overall_rating);
    if (!Number.isFinite(v)) continue;
    const cur = reviewAcc.get(id) ?? { s: 0, n: 0 };
    cur.s += v;
    cur.n += 1;
    reviewAcc.set(id, cur);
  }
  const reviewById = new Map<string, { avg: number; count: number }>();
  for (const [id, { s, n }] of reviewAcc) {
    reviewById.set(id, { avg: s / n, count: n });
  }

  const { data: bookingMetricRows, error: bookingMetricsErr } = await admin
    .from("bookings")
    .select(BOOKING_SELECT_FOR_METRICS)
    .in("expert_user_id", userIds);
  if (bookingMetricsErr) throw bookingMetricsErr;
  const rescheduleByMessageId = await fetchRescheduleMessagesForBookings(
    admin,
    bookingMetricRows ?? [],
  );
  const bookingRowsByExpert = bucketBookingsByExpertUserId(
    (bookingMetricRows ?? []) as BookingRowWithExpertId[],
  );

  const hydrated: HydratedExpert[] = [];
  for (const id of userIds) {
    const ep = expertByUserId.get(id);
    const u = userByUserId.get(id);
    if (!ep || !u) continue;

    const name =
      `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email_address;
    const profession = (u.profession ?? "").trim();
    const availRow = availById.get(id) as Parameters<typeof computeNextAvailableSummary>[0];
    const timeZone = (u as { time_zone?: string | null }).time_zone ?? null;
    const { availableNow, availableUntil } = computeAvailableNow(availRow, timeZone);

    hydrated.push({
      id,
      name,
      profile_photo: u.profile_photo,
      professional_title: profession || "",
      category_id: ep.category_id,
      category_name: ep.category_id ? categoryNameById.get(ep.category_id) ?? null : null,
      skills: ep.skills_specializations ?? [],
      rating: reviewById.get(id)?.avg ?? null,
      reviews_count: reviewById.get(id)?.count ?? 0,
      completed_sessions: summarizeExpertBookingMetrics(
        bookingRowsByExpert.get(id) ?? [],
        rescheduleByMessageId,
      ).completedSessionCount,
      bio: ep.expert_bio,
      rate_per_15_min: Number((availRow as { rate?: unknown } | undefined)?.rate ?? 0),
      online: isUserOnlineFresh(
        (u as { online?: boolean }).online,
        (u as { last_seen_at?: string | null }).last_seen_at,
      ),
      language: (u as { language?: string | null }).language ?? null,
      time_zone: timeZone,
      available_now: availableNow,
      available_until: availableUntil,
      next_available_summary: computeNextAvailableSummary(availRow, timeZone),
      next_bookable_slots: computeNextBookableSlots(availRow, timeZone, 3).map((s) => ({
        display_date: s.displayDate,
        display_time: s.displayTime,
        start_utc: new Date(s.startUtcMs).toISOString(),
        end_utc: new Date(s.endUtcMs).toISOString(),
      })),
      membership_tier: ep.membership_tier ?? "free",
      is_verified: (ep.membership_tier ?? "free") !== "free",
      first_session_discount_available: Boolean(
        (availRow as { first_session_discount_enabled?: boolean } | undefined)
          ?.first_session_discount_enabled,
      ),
      packages_available: expertsWithPackages.has(id),
      expert_visibility_state: ep.expert_visibility_state,
    });
  }

  return hydrated;
}

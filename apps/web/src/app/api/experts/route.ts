import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { getFeaturedExpertsSettings } from "@/lib/featuredExpertsSettings";
import {
  EXPERT_VISIBILITY_STATE,
  expertVisibilityStatesForBrowseGrid,
} from "@/lib/expertVisibilityState";
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

export const dynamic = "force-dynamic";

const LIST_CAP = 4000;

type ExpertRow = {
  user_id: string;
  category_id: string | null;
  experience_level: string | null;
  qualifications: string | null;
  expert_bio: string | null;
  skills_specializations: string[] | null;
  membership_tier: string | null;
  complete_sessions: number | null;
  expert_visibility_state: string | null;
};

async function reviewStatsByExpert(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<Map<string, { avg: number; count: number }>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await admin
    .from("reviews_of_experts")
    .select("expert_reviewee_id, overall_rating")
    .in("expert_reviewee_id", userIds);
  if (error || !data?.length) return new Map();
  const acc = new Map<string, { s: number; n: number }>();
  for (const r of data) {
    const id = r.expert_reviewee_id as string;
    const v = Number(r.overall_rating);
    if (!Number.isFinite(v)) continue;
    const cur = acc.get(id) ?? { s: 0, n: 0 };
    cur.s += v;
    cur.n += 1;
    acc.set(id, cur);
  }
  const out = new Map<string, { avg: number; count: number }>();
  for (const [id, { s, n }] of acc) {
    out.set(id, { avg: s / n, count: n });
  }
  return out;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const limit = Number(searchParams.get("limit") ?? "20");
  const offset = Number(searchParams.get("offset") ?? "0");
  const compact = searchParams.get("compact") === "1" || searchParams.get("compact") === "true";

  const admin = createAdminClient();
  const featured = await getFeaturedExpertsSettings(admin);
  const browseVisibilityStates = expertVisibilityStatesForBrowseGrid(featured);
  const needsRatingFilter = featured.min_avg_rating != null;

  async function fetchExpertsRows(opts: { visibleOnly: boolean }): Promise<ExpertRow[]> {
    let q = admin
      .from("expert_profiles")
      .select(
        "user_id, category_id, experience_level, qualifications, expert_bio, skills_specializations, membership_tier, complete_sessions, expert_visibility_state"
      );

    if (opts.visibleOnly) {
      q = q.in("expert_visibility_state", browseVisibilityStates);
    } else {
      q = q.eq("expert_visibility_state", EXPERT_VISIBILITY_STATE.VISIBLE_ACTIVE);
    }

    if (category) {
      q = q.eq("category_id", category);
    }

    if (featured.min_complete_sessions != null) {
      q = q.gte("complete_sessions", featured.min_complete_sessions);
    }

    if (featured.require_verified) {
      q = q.in("membership_tier", ["verified", "enterprise"]);
    }

    if (needsRatingFilter) {
      const { data, error } = await q.limit(LIST_CAP);
      if (error) throw error;
      let rows = (data ?? []) as ExpertRow[];
      const ids = rows.map((e) => e.user_id);
      const reviewStats = await reviewStatsByExpert(admin, ids);
      const min = featured.min_avg_rating!;
      rows = rows.filter((e) => {
        const s = reviewStats.get(e.user_id);
        return s != null && s.avg >= min;
      });
      return rows;
    }

    const { data, error } = await q.range(offset, offset + Math.max(limit - 1, 0));
    if (error) throw error;
    return (data ?? []) as ExpertRow[];
  }

  let experts: ExpertRow[];
  try {
    experts = await fetchExpertsRows({ visibleOnly: true });
  } catch (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  if (!experts.length) {
    try {
      experts = await fetchExpertsRows({ visibleOnly: false });
    } catch {
      // Keep strict behavior if fallback also fails.
    }
  }

  if (!experts?.length) {
    return Response.json({ experts: [] });
  }

  const userIds = experts.map((e) => e.user_id);
  const { data: users, error: userErr } = compact
    ? await admin
        .from("users")
        .select("user_id, first_name, last_name, profile_photo, email_address, profession")
        .in("user_id", userIds)
    : await admin
        .from("users")
        .select("user_id, first_name, last_name, profile_photo, email_address, profession, online, last_seen_at, language, time_zone")
        .in("user_id", userIds);
  if (userErr) {
    return Response.json({ error: publicApiError(userErr) }, { status: 500 });
  }

  const userById = new Map((users ?? []).map((u) => [u.user_id, u]));

  let categoryNameById = new Map<string, string>();
  let availById = new Map<string, Record<string, unknown>>();
  const expertsWithPackages = new Set<string>();

  if (!compact) {
    const categoryIds = [...new Set(experts.map((e) => e.category_id).filter(Boolean))] as string[];
    if (categoryIds.length) {
      const { data: cats, error: catErr } = await admin
        .from("categories")
        .select("category_id, name")
        .in("category_id", categoryIds);
      if (catErr) {
        return Response.json({ error: publicApiError(catErr) }, { status: 500 });
      }
      categoryNameById = new Map((cats ?? []).map((c) => [c.category_id, c.name]));
    }

    const { data: availability, error: availabilityErr } = await admin
      .from("expert_availability")
      .select(
        "user_id, rate, available_now, available_until, first_session_discount_enabled, weekly_schedule, availability_overrides, calendar_paused, minimum_notice, maximum_notice, minimum_booking, buffer_time",
      )
      .in("user_id", userIds);
    if (availabilityErr) {
      return Response.json({ error: publicApiError(availabilityErr) }, { status: 500 });
    }
    availById = new Map((availability ?? []).map((a) => [a.user_id, a as Record<string, unknown>]));

    const { data: packageRows, error: packageErr } = await admin
      .from("expert_packages")
      .select("expert_user_id")
      .in("expert_user_id", userIds)
      .eq("is_published", true)
      .eq("status", "active");
    if (packageErr) {
      return Response.json({ error: publicApiError(packageErr) }, { status: 500 });
    }
    for (const p of packageRows ?? []) {
      expertsWithPackages.add(p.expert_user_id as string);
    }
  }

  const reviewById = await reviewStatsByExpert(admin, userIds);

  const { data: bookingMetricRows, error: bookingMetricsErr } = await admin
    .from("bookings")
    .select(BOOKING_SELECT_FOR_METRICS)
    .in("expert_user_id", userIds);
  if (bookingMetricsErr) {
    return Response.json({ error: publicApiError(bookingMetricsErr) }, { status: 500 });
  }
  const rescheduleByMessageId = await fetchRescheduleMessagesForBookings(admin, bookingMetricRows ?? []);

  const bookingRowsByExpert = bucketBookingsByExpertUserId(
    (bookingMetricRows ?? []) as BookingRowWithExpertId[],
  );

  let mapped = experts
    .map((e) => {
      const u = userById.get(e.user_id);
      if (!u) return null;
      if (featured.require_profile_picture && !u.profile_photo) return null;
      const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email_address;
      const searchable = `${name} ${e.expert_bio ?? ""} ${(e.skills_specializations ?? []).join(" ")}`.toLowerCase();
      if (search && !searchable.includes(search.toLowerCase())) {
        return null;
      }
      const profession = (u.profession ?? "").trim();

      if (compact) {
        return {
          id: e.user_id,
          name,
          profile_photo: u.profile_photo,
          professional_title: profession || "",
          rating: reviewById.get(e.user_id)?.avg ?? null,
          reviews_count: reviewById.get(e.user_id)?.count ?? 0,
          membership_tier: e.membership_tier ?? "free",
          is_verified: (e.membership_tier ?? "free") !== "free",
          expert_visibility_state: e.expert_visibility_state,
        };
      }

      const availRow = availById.get(e.user_id) as Parameters<typeof computeNextAvailableSummary>[0];
      const timeZone = (u as { time_zone?: string | null }).time_zone ?? null;
      const { availableNow, availableUntil } = computeAvailableNow(availRow, timeZone);
      const next_available_summary = computeNextAvailableSummary(availRow, timeZone);
      const next_bookable_slots = computeNextBookableSlots(availRow, timeZone, 3).map((s) => ({
        display_date: s.displayDate,
        display_time: s.displayTime,
        start_utc: new Date(s.startUtcMs).toISOString(),
        end_utc: new Date(s.endUtcMs).toISOString(),
      }));
      return {
        id: e.user_id,
        name,
        profile_photo: u.profile_photo,
        professional_title: profession || "",
        category_id: e.category_id,
        category_name: e.category_id ? categoryNameById.get(e.category_id) ?? null : null,
        skills: e.skills_specializations ?? [],
        rating: reviewById.get(e.user_id)?.avg ?? null,
        reviews_count: reviewById.get(e.user_id)?.count ?? 0,
        completed_sessions: summarizeExpertBookingMetrics(
          bookingRowsByExpert.get(e.user_id) ?? [],
          rescheduleByMessageId,
        ).completedSessionCount,
        bio: e.expert_bio,
        rate_per_15_min: Number((availRow as { rate?: unknown } | undefined)?.rate ?? 0),
        online: isUserOnlineFresh(
          (u as { online?: boolean }).online,
          (u as { last_seen_at?: string | null }).last_seen_at,
        ),
        language: (u as { language?: string | null }).language ?? null,
        time_zone: timeZone,
        available_now: availableNow,
        available_until: availableUntil,
        next_available_summary,
        next_bookable_slots,
        membership_tier: e.membership_tier ?? "free",
        is_verified: (e.membership_tier ?? "free") !== "free",
        first_session_discount_available: Boolean(
          (availRow as { first_session_discount_enabled?: boolean } | undefined)?.first_session_discount_enabled,
        ),
        packages_available: expertsWithPackages.has(e.user_id),
        expert_visibility_state: e.expert_visibility_state,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  if (needsRatingFilter) {
    mapped = mapped.slice(offset, offset + limit);
  }

  return Response.json({ experts: mapped });
}

import { createAdminClient } from "@/lib/supabase/admin";
import { bookingRowVisibleInSessionList } from "@/lib/booking-dashboard-visibility";
import {
  isAwaitingExpertBookingRequest,
  isBookingRequestSubmittedToExpert,
} from "@/lib/booking-request";
import { displayName, getAuthedUserId, getUsersByIds } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { fetchExpertVisibilityByUserIds, partnerExpertVisibilityState } from "@/lib/experts/fetchExpertVisibilityByUserIds";
import { isUserOnlineFresh } from "@/lib/presence/online";

export const dynamic = "force-dynamic";

function timeStrToMinutes(t: unknown): number | null {
  const s = String(t ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  return h * 60 + mi;
}

function durationMinutesFromBooking(b: {
  duration?: unknown;
  start_time?: unknown;
  end_time?: unknown;
}): number | null {
  const dur = b.duration;
  if (dur != null) {
    const s = String(dur);
    const minMatch = s.match(/(\d+)\s*minutes?/i);
    if (minMatch) return Number(minMatch[1]);
    const iso = /^(\d+):(\d{2}):(\d{2})/.exec(s);
    if (iso) {
      const h = Number(iso[1]);
      const mi = Number(iso[2]);
      const sec = Number(iso[3]);
      if ([h, mi, sec].every((n) => Number.isFinite(n))) {
        return Math.round(h * 60 + mi + sec / 60);
      }
    }
  }
  const sm = timeStrToMinutes(b.start_time);
  const em = timeStrToMinutes(b.end_time);
  if (sm != null && em != null && em > sm) return em - sm;
  return null;
}

export async function GET(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const includePendingUnpaid =
    process.env.NODE_ENV !== "production" &&
    searchParams.get("include_pending_unpaid") === "1";

  const admin = createAdminClient();
  let query = admin
    .from("bookings")
    .select("*")
    .or(`learner_user_id.eq.${userId},expert_user_id.eq.${userId}`)
    .order("session_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (status) query = query.eq("status", status);
  if (type === "upcoming") query = query.gte("session_date", new Date().toISOString().slice(0, 10));
  if (type === "completed") query = query.lt("session_date", new Date().toISOString().slice(0, 10));

  const { data: bookings, error } = await query;
  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const partnerIds = new Set<string>();
  for (const b of bookings ?? []) {
    partnerIds.add(b.learner_user_id === userId ? b.expert_user_id : b.learner_user_id);
  }
  const partners = await getUsersByIds(Array.from(partnerIds));
  const byId = new Map(partners.map((u) => [u.user_id, u]));
  const expertPartnerIds = partners.filter((u) => u.has_expert_profile).map((u) => u.user_id);
  const expertVisibilityById = await fetchExpertVisibilityByUserIds(admin, expertPartnerIds);

  let sessions = (bookings ?? []).map((b) => {
    const partnerId = b.learner_user_id === userId ? b.expert_user_id : b.learner_user_id;
    const partner = byId.get(partnerId);
    const duration_minutes = durationMinutesFromBooking(b);
    return {
      ...b,
      id: b.booking_id,
      learner_id: b.learner_user_id,
      expert_id: b.expert_user_id,
      user_role: b.learner_user_id === userId ? "learner" : "expert",
      partner_name: partner ? displayName(partner) : null,
      partner_photo: partner?.profile_photo ?? null,
      partner_online: isUserOnlineFresh(partner?.online, partner?.last_seen_at),
      partner_profession: partner?.profession?.trim() || null,
      partner_has_expert_profile: partner ? Boolean(partner.has_expert_profile) : false,
      partner_expert_visibility_state: partnerExpertVisibilityState(
        partnerId,
        partner?.has_expert_profile,
        expertVisibilityById,
      ),
      duration_minutes,
      total_price: b.total_amount,
      cancellation_reason: b.cancellation_reason,
    };
  });

  if (!includePendingUnpaid) {
    sessions = sessions.filter((s) => {
      if (!bookingRowVisibleInSessionList(s.payment_status, s.user_role)) return false;
      // Experts only see booking requests after the learner saved a payment method.
      if (
        String(s.user_role ?? "").toLowerCase() === "expert" &&
        isAwaitingExpertBookingRequest(s.payment_status) &&
        !isBookingRequestSubmittedToExpert(s.payment_status, s.stripe_payment_method_id)
      ) {
        return false;
      }
      return true;
    });
  }

  const bookingIds = sessions.map((s) => s.booking_id).filter(Boolean) as string[];
  let learnerReviewIds = new Set<string>();
  let expertReviewIds = new Set<string>();
  if (bookingIds.length > 0) {
    const [expertRevRes, learnerRevRes] = await Promise.all([
      admin.from("reviews_of_experts").select("booking_id").in("booking_id", bookingIds).eq("learner_reviewer_id", userId),
      admin.from("reviews_of_learners").select("booking_id").in("booking_id", bookingIds).eq("expert_reviewer_id", userId),
    ]);
    if (expertRevRes.error) {
      return Response.json({ error: publicApiError(expertRevRes.error) }, { status: 500 });
    }
    if (learnerRevRes.error) {
      return Response.json({ error: publicApiError(learnerRevRes.error) }, { status: 500 });
    }
    learnerReviewIds = new Set((expertRevRes.data ?? []).map((r) => String(r.booking_id)));
    expertReviewIds = new Set((learnerRevRes.data ?? []).map((r) => String(r.booking_id)));
  }

  sessions = sessions.map((s) => ({
    ...s,
    review_submitted:
      s.user_role === "learner"
        ? learnerReviewIds.has(String(s.booking_id))
        : expertReviewIds.has(String(s.booking_id)),
  }));

  return Response.json({ sessions });
}

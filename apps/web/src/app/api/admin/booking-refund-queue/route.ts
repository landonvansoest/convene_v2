import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type BookingRow = {
  booking_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  duration: string | null;
  booking_amount: number | string | null;
  total_amount: number | string | null;
  stripe_payment_intent_id: string | null;
  refunded_amount_cents: number;
  refund_review_status: string;
  status: string;
  learner_user_id: string;
  expert_user_id: string;
};

type ComplaintRow = {
  feedback_id: string;
  booking_id: string;
  user_id: string | null;
  feedback_type: string;
  feedback_text: string;
  admin_review_status: string | null;
  created_at: string;
};

const BOOKING_COLUMNS =
  "booking_id, session_date, start_time, end_time, duration, booking_amount, total_amount, stripe_payment_intent_id, refunded_amount_cents, refund_review_status, status, learner_user_id, expert_user_id";

function toNumber(val: number | string | null | undefined): number {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Booking Problems queue.
 *
 * `?source=no_show` (default) — bookings where the expert no-showed and
 * refund review is still pending.
 * `?source=complaint` — user_feedback rows tied to a booking that are awaiting
 * admin review (submitted from the "Leave a review" session-issue dialog).
 */
export async function GET(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const source = (url.searchParams.get("source") ?? "no_show").toLowerCase();
  const admin = createAdminClient();

  if (source === "complaint") {
    // Pending complaints from user_feedback (tolerates migration 028 missing).
    const first = await admin
      .from("user_feedback")
      .select(
        "feedback_id, booking_id, user_id, feedback_type, feedback_text, admin_review_status, created_at",
      )
      .not("booking_id", "is", null)
      .eq("admin_review_status", "pending")
      .order("created_at", { ascending: false });

    let complaints: ComplaintRow[] = [];
    if (first.error) {
      const msg = first.error.message?.toLowerCase() ?? "";
      if (msg.includes("admin_review_status") || msg.includes("schema cache")) {
        // Migration 028 not applied yet — fall back to every booking-linked
        // feedback row and filter client-side.
        const fallback = await admin
          .from("user_feedback")
          .select(
            "feedback_id, booking_id, user_id, feedback_type, feedback_text, created_at",
          )
          .not("booking_id", "is", null)
          .order("created_at", { ascending: false });
        if (fallback.error) {
          return Response.json({ error: publicApiError(fallback.error) }, { status: 500 });
        }
        complaints = (fallback.data ?? []).map((r) => ({
          ...(r as ComplaintRow),
          admin_review_status: "pending",
        }));
      } else {
        return Response.json({ error: publicApiError(first.error) }, { status: 500 });
      }
    } else {
      complaints = (first.data ?? []) as ComplaintRow[];
    }

    if (complaints.length === 0) {
      return Response.json({ bookings: [], source: "complaint" });
    }

    const bookingIds = Array.from(new Set(complaints.map((c) => c.booking_id)));
    const { data: bookingRows, error: bookErr } = await admin
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .in("booking_id", bookingIds);

    if (bookErr) return Response.json({ error: publicApiError(bookErr) }, { status: 500 });
    const bookingById = new Map((bookingRows ?? []).map((b) => [b.booking_id as string, b as BookingRow]));

    const userIds = new Set<string>();
    for (const c of complaints) if (c.user_id) userIds.add(c.user_id);
    for (const b of bookingRows ?? []) {
      userIds.add((b as BookingRow).learner_user_id);
      userIds.add((b as BookingRow).expert_user_id);
    }

    const { data: users } = userIds.size
      ? await admin
          .from("users")
          .select("user_id, email_address, first_name, last_name")
          .in("user_id", Array.from(userIds))
      : { data: [] as Array<{ user_id: string; email_address: string | null; first_name: string | null; last_name: string | null }> };
    const byUser = new Map((users ?? []).map((u) => [u.user_id, u]));

    const rows = complaints
      .map((c) => {
        const b = bookingById.get(c.booking_id);
        if (!b) return null;
        const learner = byUser.get(b.learner_user_id);
        const expert = byUser.get(b.expert_user_id);
        const complaintUser = c.user_id ? byUser.get(c.user_id) : null;
        return {
          booking_id: b.booking_id,
          session_date: b.session_date,
          start_time: b.start_time,
          end_time: b.end_time,
          duration: b.duration,
          booking_amount: toNumber(b.booking_amount),
          total_amount: toNumber(b.total_amount),
          stripe_payment_intent_id: b.stripe_payment_intent_id,
          refunded_amount_cents: Number(b.refunded_amount_cents ?? 0),
          refund_review_status: b.refund_review_status,
          status: b.status,
          learner_user_id: b.learner_user_id,
          learner_email: learner?.email_address ?? null,
          learner_name:
            [learner?.first_name, learner?.last_name].filter(Boolean).join(" ").trim() || null,
          expert_email: expert?.email_address ?? null,
          expert_name:
            [expert?.first_name, expert?.last_name].filter(Boolean).join(" ").trim() || null,
          feedback_id: c.feedback_id,
          feedback_type: c.feedback_type,
          feedback_text: c.feedback_text,
          feedback_created_at: c.created_at,
          feedback_author_email: complaintUser?.email_address ?? null,
          feedback_author_name:
            [complaintUser?.first_name, complaintUser?.last_name]
              .filter(Boolean)
              .join(" ")
              .trim() || null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return Response.json({ bookings: rows, source: "complaint" });
  }

  // Default: Expert No-Show queue.
  const { data: rows, error } = await admin
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("status", "no_show_expert")
    .eq("refund_review_status", "pending")
    .order("session_date", { ascending: false });

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const list = (rows ?? []) as BookingRow[];
  if (list.length === 0) {
    return Response.json({ bookings: [], source: "no_show" });
  }

  const userIds = new Set<string>();
  for (const r of list) {
    userIds.add(r.learner_user_id);
    userIds.add(r.expert_user_id);
  }

  const { data: users } = await admin
    .from("users")
    .select("user_id, email_address, first_name, last_name")
    .in("user_id", Array.from(userIds));

  const byUser = new Map((users ?? []).map((u) => [u.user_id, u]));

  const bookings = list.map((b) => {
    const learner = byUser.get(b.learner_user_id);
    const expert = byUser.get(b.expert_user_id);
    return {
      booking_id: b.booking_id,
      session_date: b.session_date,
      start_time: b.start_time,
      end_time: b.end_time,
      duration: b.duration,
      booking_amount: toNumber(b.booking_amount),
      total_amount: toNumber(b.total_amount),
      stripe_payment_intent_id: b.stripe_payment_intent_id,
      refunded_amount_cents: Number(b.refunded_amount_cents ?? 0),
      refund_review_status: b.refund_review_status,
      status: b.status,
      learner_user_id: b.learner_user_id,
      learner_email: learner?.email_address ?? null,
      learner_name:
        [learner?.first_name, learner?.last_name].filter(Boolean).join(" ").trim() || null,
      expert_email: expert?.email_address ?? null,
      expert_name:
        [expert?.first_name, expert?.last_name].filter(Boolean).join(" ").trim() || null,
    };
  });

  return Response.json({ bookings, source: "no_show" });
}

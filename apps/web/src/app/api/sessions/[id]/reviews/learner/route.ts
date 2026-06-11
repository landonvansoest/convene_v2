import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { hasSessionEndedByWallClock } from "@/lib/sessionWallClock";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const rating = z.number().int().min(1).max(5);

const postSchema = z
  .object({
    overall_rating: rating,
    prepared_rating: rating.optional().nullable(),
    respectful_rating: rating.optional().nullable(),
    personable_rating: rating.optional().nullable(),
    public_review: z.string().max(8000).optional().nullable(),
    private_message: z.string().max(8000).optional().nullable(),
  })
  .strict();

/** Expert reviews learner for a completed booking. */
export async function POST(request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: bookingId } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: booking, error: bookErr } = await admin
    .from("bookings")
    .select("booking_id, learner_user_id, expert_user_id, status, session_date, end_time, cancelled_at")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (bookErr) {
    return Response.json({ error: publicApiError(bookErr) }, { status: 500 });
  }
  if (!booking) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.expert_user_id !== userId) {
    return Response.json({ error: "Only the expert can submit this review" }, { status: 403 });
  }
  const st = String(booking.status ?? "").toLowerCase();
  if (booking.cancelled_at || st === "cancelled") {
    return Response.json({ error: "Cancelled bookings cannot be reviewed" }, { status: 400 });
  }
  if (st === "no_show_expert" || st === "no_show_learner" || st === "no_show") {
    return Response.json({ error: "This session cannot be reviewed" }, { status: 400 });
  }
  const endedByWallClock = hasSessionEndedByWallClock(
    booking.session_date != null ? String(booking.session_date) : "",
    booking.end_time != null ? String(booking.end_time) : undefined,
  );
  if (booking.status !== "complete" && !endedByWallClock) {
    return Response.json({ error: "Session must be complete before reviewing" }, { status: 400 });
  }

  const { data: existing } = await admin
    .from("reviews_of_learners")
    .select("review_id")
    .eq("booking_id", bookingId)
    .eq("expert_reviewer_id", userId)
    .maybeSingle();

  if (existing) {
    return Response.json({ error: "Review already submitted for this booking" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const b = parsed.data;
  const { data: row, error: insErr } = await admin
    .from("reviews_of_learners")
    .insert({
      booking_id: bookingId,
      expert_reviewer_id: userId,
      learner_reviewee_id: booking.learner_user_id,
      overall_rating: b.overall_rating,
      prepared_rating: b.prepared_rating ?? null,
      respectful_rating: b.respectful_rating ?? null,
      personable_rating: b.personable_rating ?? null,
      public_review: b.public_review ?? null,
      private_message: b.private_message ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insErr) {
    return Response.json({ error: publicApiError(insErr) }, { status: 500 });
  }

  return Response.json({ review: row }, { status: 201 });
}

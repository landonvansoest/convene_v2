import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const rating = z.number().int().min(1).max(5);

const postReviewSchema = z
  .object({
    overall_rating: rating,
    questions_rating: rating.optional().nullable(),
    knowledgeable_rating: rating.optional().nullable(),
    personable_rating: rating.optional().nullable(),
    public_review: z.string().max(8000).optional().nullable(),
    private_message: z.string().max(8000).optional().nullable(),
  })
  .strict();

/** Learner reviews expert for a completed booking (one per booking per learner). */
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

  const parsed = postReviewSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: booking, error: bookErr } = await admin
    .from("bookings")
    .select("booking_id, learner_user_id, expert_user_id, status")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (bookErr) {
    return Response.json({ error: publicApiError(bookErr) }, { status: 500 });
  }
  if (!booking) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.learner_user_id !== userId) {
    return Response.json({ error: "Only the learner can submit this review" }, { status: 403 });
  }
  if (booking.status !== "complete") {
    return Response.json({ error: "Session must be complete before reviewing" }, { status: 400 });
  }

  const { data: existing } = await admin
    .from("reviews_of_experts")
    .select("review_id")
    .eq("booking_id", bookingId)
    .eq("learner_reviewer_id", userId)
    .maybeSingle();

  if (existing) {
    return Response.json({ error: "Review already submitted for this booking" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const body = parsed.data;
  const { data: row, error: insErr } = await admin
    .from("reviews_of_experts")
    .insert({
      booking_id: bookingId,
      learner_reviewer_id: userId,
      expert_reviewee_id: booking.expert_user_id,
      overall_rating: body.overall_rating,
      questions_rating: body.questions_rating ?? null,
      knowledgeable_rating: body.knowledgeable_rating ?? null,
      personable_rating: body.personable_rating ?? null,
      public_review: body.public_review ?? null,
      private_message: body.private_message ?? null,
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

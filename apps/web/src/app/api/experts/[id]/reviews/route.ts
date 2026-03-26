import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Public expert reviews (no private messages). */
export async function GET(request: Request, { params }: Params) {
  const { id: expertUserId } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "20") || 20, 50);

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("reviews_of_experts")
    .select(
      "review_id, booking_id, overall_rating, questions_rating, knowledgeable_rating, personable_rating, public_review, created_at, learner_reviewer_id"
    )
    .eq("expert_reviewee_id", expertUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const list = rows ?? [];
  const avg =
    list.length > 0
      ? list.reduce((s, r) => s + Number(r.overall_rating), 0) / list.length
      : null;

  return Response.json({
    reviews: list.map((r) => ({
      review_id: r.review_id,
      booking_id: r.booking_id,
      overall_rating: r.overall_rating,
      questions_rating: r.questions_rating,
      knowledgeable_rating: r.knowledgeable_rating,
      personable_rating: r.personable_rating,
      public_review: r.public_review,
      created_at: r.created_at,
    })),
    count: list.length,
    average_overall: avg != null ? Math.round(avg * 10) / 10 : null,
  });
}

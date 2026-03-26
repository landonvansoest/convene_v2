import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Public reviews of a learner written by experts (no private messages). */
export async function GET(request: Request, { params }: Params) {
  const { id: learnerUserId } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "20") || 20, 50);

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("reviews_of_learners")
    .select(
      "review_id, booking_id, overall_rating, prepared_rating, respectful_rating, personable_rating, public_review, created_at"
    )
    .eq("learner_reviewee_id", learnerUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const list = rows ?? [];
  const avg =
    list.length > 0 ? list.reduce((s, r) => s + Number(r.overall_rating), 0) / list.length : null;

  return Response.json({
    reviews: list,
    count: list.length,
    average_overall: avg != null ? Math.round(avg * 10) / 10 : null,
  });
}

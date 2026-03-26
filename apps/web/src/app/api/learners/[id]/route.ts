import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Public learner profile (v1 /learner/:id parity). */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: user, error: userErr } = await admin
    .from("users")
    .select(
      "user_id, first_name, last_name, profile_photo, profession, hometown, introduction, profile_visibility_state, sessions_completed, learner_dependability_rating, has_expert_profile"
    )
    .eq("user_id", id)
    .maybeSingle();

  if (userErr) {
    return Response.json({ error: publicApiError(userErr) }, { status: 500 });
  }
  if (!user) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (user.profile_visibility_state !== "visible") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { data: reviews, error: revErr } = await admin
    .from("reviews_of_learners")
    .select("review_id, overall_rating, public_review, created_at, expert_reviewer_id")
    .eq("learner_reviewee_id", id)
    .order("created_at", { ascending: false })
    .limit(25);

  if (revErr) {
    return Response.json({ error: publicApiError(revErr) }, { status: 500 });
  }

  const reviewerIds = [...new Set((reviews ?? []).map((r) => r.expert_reviewer_id))];
  const names = new Map<string, string>();
  if (reviewerIds.length) {
    const { data: ru } = await admin
      .from("users")
      .select("user_id, first_name, last_name, email_address")
      .in("user_id", reviewerIds);
    for (const u of ru ?? []) {
      const n = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email_address;
      names.set(u.user_id, n);
    }
  }

  const list = reviews ?? [];
  const avg =
    list.length > 0
      ? list.reduce((s, r) => s + Number(r.overall_rating), 0) / list.length
      : null;

  const name =
    `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "Learner";

  return Response.json({
    learner: {
      id: user.user_id,
      name,
      profile_photo: user.profile_photo,
      professional_title: user.profession ?? "",
      hometown: user.hometown ?? "",
      about: user.introduction ?? "",
      completed_sessions: user.sessions_completed ?? 0,
      dependability_rating: user.learner_dependability_rating,
    },
    reviews: list.map((r) => ({
      review_id: r.review_id,
      rating: r.overall_rating,
      review_text: r.public_review,
      created_at: r.created_at,
      reviewer_name: names.get(r.expert_reviewer_id) ?? "Expert",
    })),
    average_rating: avg,
  });
}

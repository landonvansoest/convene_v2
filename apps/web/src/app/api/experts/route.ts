import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import {
  expertStatusesForPublicList,
  getFeaturedExpertsSettings,
} from "@/lib/featuredExpertsSettings";

export const dynamic = "force-dynamic";

const LIST_CAP = 4000;

type ExpertRow = {
  user_id: string;
  category_id: string | null;
  experience_level: string | null;
  qualifications: string | null;
  expert_bio: string | null;
  skills_specializations: string[] | null;
  is_verified: boolean | null;
  complete_sessions: number | null;
  expert_status: string | null;
};

async function averageOverallByExpert(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<Map<string, number>> {
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
  const out = new Map<string, number>();
  for (const [id, { s, n }] of acc) {
    out.set(id, s / n);
  }
  return out;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const limit = Number(searchParams.get("limit") ?? "20");
  const offset = Number(searchParams.get("offset") ?? "0");

  const admin = createAdminClient();
  const featured = await getFeaturedExpertsSettings(admin);
  const statuses = expertStatusesForPublicList(featured);

  let q = admin
    .from("expert_profiles")
    .select(
      "user_id, category_id, experience_level, qualifications, expert_bio, skills_specializations, is_verified, complete_sessions, expert_status"
    )
    .in("expert_status", statuses);

  if (category) {
    q = q.eq("category_id", category);
  }

  if (featured.min_complete_sessions != null) {
    q = q.gte("complete_sessions", featured.min_complete_sessions);
  }

  if (featured.require_verified) {
    q = q.eq("is_verified", true);
  }

  const needsRatingFilter = featured.min_avg_rating != null;
  let experts: ExpertRow[];

  if (needsRatingFilter) {
    const { data, error } = await q.limit(LIST_CAP);
    if (error) {
      return Response.json({ error: publicApiError(error) }, { status: 500 });
    }
    experts = (data ?? []) as ExpertRow[];
    const ids = experts.map((e) => e.user_id);
    const avgs = await averageOverallByExpert(admin, ids);
    const min = featured.min_avg_rating!;
    experts = experts.filter((e) => {
      const a = avgs.get(e.user_id);
      return a != null && a >= min;
    });
  } else {
    const { data, error } = await q.range(offset, offset + Math.max(limit - 1, 0));
    if (error) {
      return Response.json({ error: publicApiError(error) }, { status: 500 });
    }
    experts = (data ?? []) as ExpertRow[];
  }

  if (!experts?.length) {
    return Response.json({ experts: [] });
  }

  const userIds = experts.map((e) => e.user_id);
  const { data: users, error: userErr } = await admin
    .from("users")
    .select("user_id, first_name, last_name, profile_photo, email_address, profession")
    .in("user_id", userIds);
  if (userErr) {
    return Response.json({ error: publicApiError(userErr) }, { status: 500 });
  }

  const categoryIds = [...new Set(experts.map((e) => e.category_id).filter(Boolean))] as string[];
  let categoryNameById = new Map<string, string>();
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
    .select("user_id, rate")
    .in("user_id", userIds);
  if (availabilityErr) {
    return Response.json({ error: publicApiError(availabilityErr) }, { status: 500 });
  }

  const userById = new Map((users ?? []).map((u) => [u.user_id, u]));
  const rateById = new Map((availability ?? []).map((a) => [a.user_id, a.rate]));

  let mapped = experts
    .map((e) => {
      const u = userById.get(e.user_id);
      if (!u) return null;
      const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email_address;
      const searchable = `${name} ${e.expert_bio ?? ""} ${(e.skills_specializations ?? []).join(" ")}`.toLowerCase();
      if (search && !searchable.includes(search.toLowerCase())) {
        return null;
      }
      const profession = (u.profession ?? "").trim();
      return {
        id: e.user_id,
        name,
        profile_photo: u.profile_photo,
        professional_title: profession || e.experience_level || "",
        category_id: e.category_id,
        category_name: e.category_id ? categoryNameById.get(e.category_id) ?? null : null,
        skills: e.skills_specializations ?? [],
        rating: null,
        completed_sessions: e.complete_sessions,
        bio: e.expert_bio,
        rate_per_15_min: Number(rateById.get(e.user_id) ?? 0),
        is_verified: e.is_verified,
        expert_status: e.expert_status,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  if (needsRatingFilter) {
    mapped = mapped.slice(offset, offset + limit);
  }

  return Response.json({ experts: mapped });
}

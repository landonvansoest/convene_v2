import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type PendingProfileRow = {
  expert_profile_id: string;
  user_id: string;
  full_name: string | null;
  experience_level: string | null;
  category_id: string | null;
  qualifications: string | null;
  expert_bio: string | null;
  about_services: string | null;
  skills_specializations: string[] | null;
  expert_visibility_state: string | null;
  registration_submitted_at: string | null;
  created_at: string | null;
};

async function runCheck(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const selectColumns =
    "expert_profile_id, user_id, full_name, experience_level, category_id, qualifications, expert_bio, about_services, skills_specializations, expert_visibility_state, registration_submitted_at, created_at";

  // The `waitlisted` enum value is introduced by migration 027. To keep this
  // endpoint working both before and after that migration is applied, we query
  // `pending_admin_review` first (always valid) and then attempt to pull
  // `waitlisted` rows separately, ignoring failures when the enum doesn't yet
  // exist in the target database.
  const [pendingResult, waitlistedResult] = await Promise.all([
    admin
      .from("expert_profiles")
      .select(selectColumns)
      .eq("expert_visibility_state", "pending_admin_review")
      .not("registration_submitted_at", "is", null)
      .order("registration_submitted_at", { ascending: false }),
    admin
      .from("expert_profiles")
      .select(selectColumns)
      .eq("expert_visibility_state", "waitlisted")
      .not("registration_submitted_at", "is", null)
      .order("registration_submitted_at", { ascending: false }),
  ]);

  if (pendingResult.error) {
    return Response.json(
      { success: false, error: publicApiError(pendingResult.error) },
      { status: 500 },
    );
  }

  const rows = [
    ...(pendingResult.data ?? []),
    ...(waitlistedResult.error ? [] : waitlistedResult.data ?? []),
  ] as PendingProfileRow[];

  const userIds = Array.from(new Set(rows.map((e) => e.user_id)));
  const categoryIds = Array.from(
    new Set(rows.map((e) => e.category_id).filter((v): v is string => Boolean(v))),
  );

  const [usersResult, categoriesResult] = await Promise.all([
    userIds.length
      ? admin
          .from("users")
          .select("user_id, first_name, last_name, email_address")
          .in("user_id", userIds)
      : Promise.resolve({ data: [] as Array<Record<string, string>> }),
    categoryIds.length
      ? admin
          .from("categories")
          .select("category_id, name")
          .in("category_id", categoryIds)
      : Promise.resolve({ data: [] as Array<Record<string, string>> }),
  ]);

  const byUser = new Map((usersResult.data ?? []).map((u) => [u.user_id, u]));
  const byCategory = new Map(
    (categoriesResult.data ?? []).map((c) => [c.category_id, c.name as string]),
  );

  const experts = rows.map((ep) => {
    const u = byUser.get(ep.user_id);
    const name =
      ep.full_name?.trim() ||
      `${u?.first_name ?? ""} ${u?.last_name ?? ""}`.trim() ||
      u?.email_address ||
      "Unknown";
    return {
      id: ep.expert_profile_id,
      user_id: ep.user_id,
      name,
      email: u?.email_address ?? null,
      first_name: u?.first_name ?? null,
      last_name: u?.last_name ?? null,
      professional_title: ep.experience_level,
      experience_level: ep.experience_level,
      category_id: ep.category_id,
      category: ep.category_id ? byCategory.get(ep.category_id) ?? null : null,
      qualifications: ep.qualifications,
      expert_bio: ep.expert_bio,
      about_services: ep.about_services,
      skills_specializations: ep.skills_specializations ?? [],
      expert_visibility_state: ep.expert_visibility_state ?? null,
      registration_submitted_at: ep.registration_submitted_at,
      created_at: ep.created_at,
    };
  });

  return Response.json({
    success: true,
    pendingCount: experts.length,
    emailSent: false,
    message: experts.length ? "Pending experts found" : "No pending experts",
    experts,
  });
}

export async function GET(request: Request) {
  return runCheck(request);
}

export async function POST(request: Request) {
  return runCheck(request);
}

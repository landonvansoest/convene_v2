import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

async function runCheck(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data: pendingExperts, error } = await admin
    .from("expert_profiles")
    .select("expert_profile_id, user_id, experience_level, category_id, created_at")
    .in("expert_status", ["pending", "temp"]);

  if (error) {
    return Response.json({ success: false, error: publicApiError(error) }, { status: 500 });
  }

  const userIds = (pendingExperts ?? []).map((e) => e.user_id);
  const { data: users } = userIds.length
    ? await admin
        .from("users")
        .select("user_id, first_name, last_name, email_address")
        .in("user_id", userIds)
    : { data: [] as Array<Record<string, string>> };

  const byId = new Map((users ?? []).map((u) => [u.user_id, u]));
  const experts = (pendingExperts ?? []).map((ep) => {
    const u = byId.get(ep.user_id);
    const name = `${u?.first_name ?? ""} ${u?.last_name ?? ""}`.trim() || u?.email_address || "Unknown";
    return {
      id: ep.expert_profile_id,
      user_id: ep.user_id,
      name,
      email: u?.email_address ?? null,
      professional_title: ep.experience_level,
      category: ep.category_id,
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

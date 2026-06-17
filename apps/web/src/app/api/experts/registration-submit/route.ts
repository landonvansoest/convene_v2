import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { ensureExpertRegistrationWelcomeInbox } from "@/lib/messages/welcome-inbox";
import { dispatchExpertRegistrationAlert } from "@/lib/notifications/admin-alerts";
import { publicApiError } from "@/lib/api/public-error";
import { requiredFieldErrors } from "@/lib/expert-registration";

export const dynamic = "force-dynamic";

export async function POST() {
  const userId = await getAuthedUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: user, error: userErr } = await admin
    .from("users")
    .select(
      "first_name, last_name, phone_number, hometown, time_zone, profession, email_address",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (userErr) return Response.json({ error: publicApiError(userErr) }, { status: 500 });

  const { data: expert, error: expertErr } = await admin
    .from("expert_profiles")
    .select(
      "user_id, category_id, experience_level, qualifications, expert_bio, about_services, skills_specializations"
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (expertErr) return Response.json({ error: publicApiError(expertErr) }, { status: 500 });

  const { data: availability, error: availErr } = await admin
    .from("expert_availability")
    .select("rate, weekly_schedule")
    .eq("user_id", userId)
    .maybeSingle();
  if (availErr) return Response.json({ error: publicApiError(availErr) }, { status: 500 });

  const missing = requiredFieldErrors({
    ...user,
    ...expert,
    rate_per_15_min: Number(availability?.rate ?? NaN),
    weekly_schedule:
      availability?.weekly_schedule && typeof availability.weekly_schedule === "object"
        ? availability.weekly_schedule
        : {},
  });
  if (missing.length > 0) {
    return Response.json(
      { error: "Missing required expert registration fields", missing_fields: missing },
      { status: 400 }
    );
  }

  const { error: profileErr } = await admin
    .from("expert_profiles")
    .update({
      expert_visibility_state: "pending_admin_review",
      registration_submitted_at: now,
      updated_at: now,
    })
    .eq("user_id", userId);
  if (profileErr) return Response.json({ error: publicApiError(profileErr) }, { status: 500 });

  const { error: userUpErr } = await admin
    .from("users")
    .update({
      has_expert_profile: true,
      convene_role_mode: "expert",
      updated_at: now,
    })
    .eq("user_id", userId);
  if (userUpErr) return Response.json({ error: publicApiError(userUpErr) }, { status: 500 });

  try {
    await ensureExpertRegistrationWelcomeInbox(userId);
  } catch (e) {
    console.error("[registration-submit] expert welcome inbox", e);
  }

  try {
    const fullName = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();
    await dispatchExpertRegistrationAlert({
      userId,
      name: fullName || null,
      email: (user?.email_address ?? null) || null,
      profession: user?.profession ?? null,
    });
  } catch (e) {
    console.error("[registration-submit] admin alert", e);
  }

  return Response.json({
    success: true,
    message: "Submitted for admin approval.",
  });
}

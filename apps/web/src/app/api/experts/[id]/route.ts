import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: profile, error: profileErr } = await admin
    .from("expert_profiles")
    .select("*")
    .eq("user_id", id)
    .maybeSingle();
  if (profileErr) return Response.json({ error: publicApiError(profileErr) }, { status: 500 });
  if (!profile) return Response.json({ error: "Expert not found" }, { status: 404 });

  const { data: user, error: userErr } = await admin
    .from("users")
    .select("user_id, first_name, last_name, profile_photo, email_address, profession, hometown")
    .eq("user_id", id)
    .maybeSingle();
  if (userErr) return Response.json({ error: publicApiError(userErr) }, { status: 500 });
  if (!user) return Response.json({ error: "Expert not found" }, { status: 404 });

  let category_name: string | null = null;
  if (profile.category_id) {
    const { data: cat } = await admin
      .from("categories")
      .select("name")
      .eq("category_id", profile.category_id)
      .maybeSingle();
    category_name = cat?.name ?? null;
  }

  const { data: availability } = await admin
    .from("expert_availability")
    .select(
      "rate, first_session_discount_enabled, first_session_discount_max_session_minutes, first_session_discount_effective_from, first_session_discount_effective_until"
    )
    .eq("user_id", id)
    .maybeSingle();

  const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.email_address;
  return Response.json({
    expert: {
      id: user.user_id,
      name,
      profile_photo: user.profile_photo,
      email: user.email_address,
      profession: user.profession,
      hometown: user.hometown,
      category_name,
      ...profile,
      ...(availability
        ? {
            rate: availability.rate,
            first_session_discount_enabled: availability.first_session_discount_enabled,
            first_session_discount_max_session_minutes:
              availability.first_session_discount_max_session_minutes,
            first_session_discount_effective_from: availability.first_session_discount_effective_from,
            first_session_discount_effective_until: availability.first_session_discount_effective_until,
          }
        : {}),
    },
  });
}

import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const approveSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

export async function PUT(request: Request, { params }: Params) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const { id } = await params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = approveSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const isApproved = parsed.data.action === "approve";
  const expertStatus = isApproved ? "active" : "temp";
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("expert_profiles")
    .update({
      expert_status: expertStatus,
      is_verified: isApproved,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", id)
    .select("user_id, expert_profile_id, expert_status, is_verified")
    .maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Expert profile not found" }, { status: 404 });
  }

  if (isApproved) {
    await admin
      .from("users")
      .update({
        profile_visibility_state: "visible",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", id);
  }

  return Response.json({
    success: true,
    message: `Expert ${parsed.data.action}d successfully`,
    expert: data,
  });
}

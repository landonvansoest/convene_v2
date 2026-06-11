import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { dispatchExpertApproved } from "@/lib/notifications/booking-notifications";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const approveSchema = z.object({
  action: z.enum(["approve", "reject", "waitlist"]),
});

type ActionResult = {
  expert_visibility_state: string;
  membership_tier?: "free" | "verified";
  verbMessage: string;
};

function resultForAction(action: "approve" | "reject" | "waitlist"): ActionResult {
  if (action === "approve") {
    return {
      expert_visibility_state: "visible_active",
      membership_tier: "verified",
      verbMessage: "approved",
    };
  }
  if (action === "waitlist") {
    return {
      expert_visibility_state: "waitlisted",
      verbMessage: "waitlisted",
    };
  }
  return {
    expert_visibility_state: "hidden_incomplete_fields",
    membership_tier: "free",
    verbMessage: "rejected",
  };
}

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

  const admin = createAdminClient();
  const result = resultForAction(parsed.data.action);

  const updateBody: Record<string, unknown> = {
    expert_visibility_state: result.expert_visibility_state,
    updated_at: new Date().toISOString(),
  };
  if (result.membership_tier) {
    updateBody.membership_tier = result.membership_tier;
  }

  const { data, error } = await admin
    .from("expert_profiles")
    .update(updateBody)
    .eq("user_id", id)
    .select("user_id, expert_profile_id, expert_visibility_state, membership_tier")
    .maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Expert profile not found" }, { status: 404 });
  }

  if (parsed.data.action === "approve") {
    const { data: user } = await admin
      .from("users")
      .select("first_name, last_name, email_address")
      .eq("user_id", id)
      .maybeSingle();
    if (user?.email_address) {
      const name =
        `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.email_address;
      try {
        await dispatchExpertApproved({
          recipientUserId: id,
          recipientEmail: user.email_address,
          recipientName: name,
        });
      } catch (e) {
        console.error("[expert-approve] notification failed", e);
      }
    }
  }

  return Response.json({
    success: true,
    message: `Expert ${result.verbMessage} successfully`,
    expert: data,
  });
}

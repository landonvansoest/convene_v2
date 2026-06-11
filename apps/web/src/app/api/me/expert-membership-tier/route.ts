import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { membershipTiers } from "@/lib/expert-registration";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  membership_tier: z.enum(membershipTiers),
});

/** Update subscription tier choice without resetting expert approval status. */
export async function PATCH(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("expert_profiles")
    .update({
      membership_tier: parsed.data.membership_tier,
      updated_at: now,
    })
    .eq("user_id", userId);

  if (error) return Response.json({ error: publicApiError(error) }, { status: 500 });
  return Response.json({ ok: true, membership_tier: parsed.data.membership_tier });
}

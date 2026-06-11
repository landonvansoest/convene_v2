import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

const schema = z.object({
  message: z.string().min(10).max(4000),
  coach_count: z.string().max(80).optional(),
  best_time_to_contact: z.string().max(200).optional(),
  email: z.string().email().max(200),
  phone: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const d = parsed.data;
  const feedbackText = [
    "Enterprise / B2B inquiry (expert registration)",
    "",
    `Message: ${d.message.trim()}`,
    "",
    `Number of coaches on team: ${d.coach_count?.trim() || "—"}`,
    `Best time to contact: ${d.best_time_to_contact?.trim() || "—"}`,
    `Email: ${d.email.trim()}`,
    `Phone: ${d.phone?.trim() || "—"}`,
  ].join("\n");

  const admin = createAdminClient();
  const { error } = await admin.from("user_feedback").insert({
    user_id: userId,
    feedback_type: "enterprise_inquiry",
    feedback_text: feedbackText,
    context: {
      source: "expert_registration_wizard",
      coach_count: d.coach_count ?? null,
      best_time_to_contact: d.best_time_to_contact ?? null,
      email: d.email,
      phone: d.phone ?? null,
    },
  });
  if (error) return Response.json({ error: publicApiError(error) }, { status: 500 });

  return Response.json({ success: true });
}

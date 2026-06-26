import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { dispatchUserFeedbackAlert } from "@/lib/notifications/admin-alerts";

const schema = z.object({
  suggestion: z.string().min(3).max(1000),
  feedbackType: z.string().min(3).max(120).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
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

  const admin = createAdminClient();
  const feedbackType = parsed.data.feedbackType ?? "expert_category_suggestion";
  const feedbackText = parsed.data.suggestion.trim();
  const { data: inserted, error } = await admin
    .from("user_feedback")
    .insert({
      user_id: userId,
      feedback_type: feedbackType,
      feedback_text: feedbackText,
      context: parsed.data.context ?? {},
      admin_review_status: "pending",
    })
    .select("feedback_id")
    .single();
  if (error) return Response.json({ error: publicApiError(error) }, { status: 500 });

  const { data: userRow } = await admin
    .from("users")
    .select("email_address, first_name, last_name")
    .eq("user_id", userId)
    .maybeSingle();

  try {
    await dispatchUserFeedbackAlert({
      feedbackId: inserted?.feedback_id ? String(inserted.feedback_id) : undefined,
      feedbackType,
      feedbackText,
      userEmail: userRow?.email_address ?? null,
      userName:
        [userRow?.first_name, userRow?.last_name].filter(Boolean).join(" ").trim() || null,
    });
  } catch {
    /* best-effort */
  }

  return Response.json({ success: true });
}

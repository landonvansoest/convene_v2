import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

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
  const { error } = await admin.from("user_feedback").insert({
    user_id: userId,
    feedback_type: parsed.data.feedbackType ?? "expert_category_suggestion",
    feedback_text: parsed.data.suggestion.trim(),
    context: parsed.data.context ?? {},
  });
  if (error) return Response.json({ error: publicApiError(error) }, { status: 500 });

  return Response.json({ success: true });
}

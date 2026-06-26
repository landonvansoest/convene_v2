import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { dispatchUserFeedbackAlert } from "@/lib/notifications/admin-alerts";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated feedback channel used when `supabase.auth.signUp()` fails
 * (rate limit, duplicate email, provider disabled, etc.) — the visitor has no
 * session yet, so we don't require a `user_id`. The email they entered on the
 * signup form and the raw Supabase error are captured in `context` so admins
 * can follow up.
 *
 * Safety notes:
 * - `user_id` is left null (the column allows it via ON DELETE SET NULL).
 * - This endpoint is public, so we cap message length and sanity-check email.
 *   Future hardening: add IP-based rate limiting via middleware or turnstile.
 */

const schema = z
  .object({
    email: z.string().email().max(200),
    message: z.string().min(1).max(4000),
    error_status: z.number().int().optional(),
    error_code: z.string().max(120).optional(),
    error_message: z.string().max(2000).optional(),
  })
  .strict();

export async function POST(request: Request) {
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

  const { email, message, error_status, error_code, error_message } = parsed.data;

  const feedbackText = [
    "Signup error — visitor could not create an account.",
    "",
    `Email they tried: ${email.trim()}`,
    error_status ? `HTTP status: ${error_status}` : null,
    error_code ? `Error code: ${error_code}` : null,
    error_message ? `Supabase message: ${error_message}` : null,
    "",
    "Visitor message:",
    message.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("user_feedback")
    .insert({
      user_id: null,
      feedback_type: "signup_issue",
      feedback_text: feedbackText,
      context: {
        source: "signup_dialog",
        email: email.trim(),
        error_status: error_status ?? null,
        error_code: error_code ?? null,
        error_message: error_message ?? null,
      },
      admin_review_status: "pending",
    })
    .select("feedback_id")
    .single();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  try {
    await dispatchUserFeedbackAlert({
      feedbackId: inserted?.feedback_id ? String(inserted.feedback_id) : undefined,
      feedbackType: "signup_issue",
      feedbackText,
      userEmail: email.trim(),
    });
  } catch {
    /* best-effort */
  }

  return Response.json({ ok: true });
}

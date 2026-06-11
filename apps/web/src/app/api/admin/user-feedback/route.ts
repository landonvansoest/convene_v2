import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type FeedbackRow = {
  feedback_id: string;
  user_id: string | null;
  feedback_type: string;
  feedback_text: string;
  context: unknown;
  created_at: string;
  booking_id: string | null;
};

/**
 * Admin inbox: user-submitted feedback (enterprise inquiries, session issues,
 * category suggestions, etc). Most recent first.
 */
export async function GET(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("user_feedback")
    .select(
      "feedback_id, user_id, feedback_type, feedback_text, context, created_at, booking_id",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const list = (rows ?? []) as FeedbackRow[];
  if (list.length === 0) {
    return Response.json({ feedback: [] });
  }

  const userIds = Array.from(
    new Set(list.map((r) => r.user_id).filter((v): v is string => Boolean(v))),
  );

  const byUser = new Map<string, { email: string | null; name: string | null }>();
  if (userIds.length) {
    const { data: users } = await admin
      .from("users")
      .select("user_id, email_address, first_name, last_name")
      .in("user_id", userIds);
    for (const u of users ?? []) {
      byUser.set(u.user_id, {
        email: u.email_address ?? null,
        name:
          [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || null,
      });
    }
  }

  const feedback = list.map((r) => ({
    ...r,
    user_email: r.user_id ? byUser.get(r.user_id)?.email ?? null : null,
    user_name: r.user_id ? byUser.get(r.user_id)?.name ?? null : null,
  }));

  return Response.json({ feedback });
}

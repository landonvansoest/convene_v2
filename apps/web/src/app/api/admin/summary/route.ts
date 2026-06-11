import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Counts powering the admin sidebar "new items pending review" badges.
 * Each count is best-effort — if the underlying table or migration isn't in
 * place yet we silently treat that source as zero rather than returning 500,
 * since the sidebar is cosmetic and must never block the dashboard.
 */
export async function GET(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const admin = createAdminClient();

  const [
    pendingExperts,
    refundQueueNoShow,
    refundQueueComplaint,
    feedbackTotal,
    helpTicketsOpen,
    freelanceAdminReview,
  ] = await Promise.all([
    admin
      .from("users")
      .select("user_id", { count: "exact", head: true })
      .eq("expert_visibility_state", "pending_admin_review"),
    admin
      .from("bookings")
      .select("booking_id", { count: "exact", head: true })
      .eq("status", "no_show_expert")
      .eq("refund_review_status", "pending"),
    admin
      .from("user_feedback")
      .select("feedback_id", { count: "exact", head: true })
      .not("booking_id", "is", null)
      .eq("admin_review_status", "pending"),
    admin.from("user_feedback").select("feedback_id", { count: "exact", head: true }),
    admin
      .from("help_tickets")
      .select("ticket_id", { count: "exact", head: true })
      .eq("status", "open"),
    admin
      .from("freelance_work")
      .select("freelance_id", { count: "exact", head: true })
      .eq("status", "admin_review"),
  ]);

  const bookingProblems =
    (refundQueueNoShow.error ? 0 : refundQueueNoShow.count ?? 0) +
    (refundQueueComplaint.error ? 0 : refundQueueComplaint.count ?? 0);

  return Response.json({
    counts: {
      expertRegistrations: pendingExperts.error ? 0 : pendingExperts.count ?? 0,
      bookingProblems,
      // Sidebar badge: only "open" tickets — those waiting on Convene.
      // (awaiting_user / resolved / closed don't need admin attention.)
      helpTickets: helpTicketsOpen.error ? 0 : helpTicketsOpen.count ?? 0,
      freelanceAdminReview: freelanceAdminReview.error ? 0 : freelanceAdminReview.count ?? 0,
      userFeedback: feedbackTotal.error ? 0 : feedbackTotal.count ?? 0,
    },
  });
}

import type { createAdminClient } from "@/lib/supabase/admin";

export type AdminSidebarCounts = {
  expertRegistrations: number;
  bookingProblems: number;
  freelanceAdminReview: number;
  helpTickets: number;
  userFeedback: number;
};

type Admin = ReturnType<typeof createAdminClient>;

/** Matches `/api/admin/check-pending-experts` — submitted profiles awaiting review. */
async function countPendingExpertRegistrations(admin: Admin): Promise<number> {
  const [pending, waitlisted] = await Promise.all([
    admin
      .from("expert_profiles")
      .select("expert_profile_id", { count: "exact", head: true })
      .eq("expert_visibility_state", "pending_admin_review")
      .not("registration_submitted_at", "is", null),
    admin
      .from("expert_profiles")
      .select("expert_profile_id", { count: "exact", head: true })
      .eq("expert_visibility_state", "waitlisted")
      .not("registration_submitted_at", "is", null),
  ]);

  let total = pending.error ? 0 : pending.count ?? 0;
  if (!waitlisted.error) total += waitlisted.count ?? 0;
  return total;
}

/** Pending admin triage rows (migration 028+). */
async function countPendingUserFeedback(admin: Admin): Promise<number> {
  const { count, error } = await admin
    .from("user_feedback")
    .select("feedback_id", { count: "exact", head: true })
    .eq("admin_review_status", "pending");
  return error ? 0 : count ?? 0;
}

/**
 * Sidebar badge counts for the admin dashboard. Each source is best-effort —
 * missing tables/migrations return zero instead of failing the whole summary.
 */
export async function loadAdminSidebarCounts(admin: Admin): Promise<AdminSidebarCounts> {
  const [
    expertRegistrations,
    refundQueueNoShow,
    refundQueueComplaint,
    helpTicketsOpen,
    freelanceAdminReview,
    userFeedback,
  ] = await Promise.all([
    countPendingExpertRegistrations(admin),
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
    admin
      .from("help_tickets")
      .select("ticket_id", { count: "exact", head: true })
      .eq("status", "open"),
    admin
      .from("freelance_work")
      .select("freelance_id", { count: "exact", head: true })
      .eq("status", "admin_review"),
    countPendingUserFeedback(admin),
  ]);

  const bookingProblems =
    (refundQueueNoShow.error ? 0 : refundQueueNoShow.count ?? 0) +
    (refundQueueComplaint.error ? 0 : refundQueueComplaint.count ?? 0);

  return {
    expertRegistrations,
    bookingProblems,
    helpTickets: helpTicketsOpen.error ? 0 : helpTicketsOpen.count ?? 0,
    freelanceAdminReview: freelanceAdminReview.error ? 0 : freelanceAdminReview.count ?? 0,
    userFeedback,
  };
}

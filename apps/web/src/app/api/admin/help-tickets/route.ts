import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["open", "awaiting_user", "resolved", "closed", "all"]);

/**
 * List help tickets for the admin inbox. Filter via ?status=open|awaiting_user|
 * resolved|closed|all (default "open"). Ordered by most-recent activity first.
 */
export async function GET(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const statusParam = (url.searchParams.get("status") ?? "open").toLowerCase();
  const status = ALLOWED_STATUSES.has(statusParam) ? statusParam : "open";
  const limit = Math.min(
    Math.max(Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1),
    500,
  );

  const admin = createAdminClient();
  let query = admin
    .from("help_tickets")
    .select(
      "ticket_id, user_id, submitter_email, submitter_name, subject, status, last_message_preview, last_message_at, last_author, assigned_admin, created_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: publicApiError(error) }, { status: 500 });

  return Response.json({ tickets: data ?? [] });
}

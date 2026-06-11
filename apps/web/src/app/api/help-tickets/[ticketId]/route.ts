import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { getAuthedUserId } from "@/lib/messages/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ticketId: string }> };

/**
 * Fetch the full help-ticket thread for the signed-in submitter. Access is
 * gated on the ticket's user_id matching the caller — guest tickets are only
 * visible to admins (via the admin endpoints) until we add a magic-link flow.
 */
export async function GET(_request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { ticketId } = await params;
  const admin = createAdminClient();

  const { data: ticket, error: tErr } = await admin
    .from("help_tickets")
    .select(
      "ticket_id, user_id, submitter_email, submitter_name, subject, status, created_at, updated_at",
    )
    .eq("ticket_id", ticketId)
    .maybeSingle();
  if (tErr) return Response.json({ error: publicApiError(tErr) }, { status: 500 });
  if (!ticket) return Response.json({ error: "Ticket not found" }, { status: 404 });
  if (!ticket.user_id || ticket.user_id !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: messages, error: mErr } = await admin
    .from("help_ticket_messages")
    .select("message_id, author, admin_label, body, is_initial, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (mErr) return Response.json({ error: publicApiError(mErr) }, { status: 500 });

  return Response.json({ ticket, messages: messages ?? [] });
}

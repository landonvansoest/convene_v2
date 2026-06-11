import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { getAuthedUserId } from "@/lib/messages/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ticketId: string }> };

const replySchema = z.object({ body: z.string().trim().min(1).max(8000) }).strict();

/**
 * Append a user reply to an existing help-ticket thread. Only the original
 * submitter (authed) can post here. Closed/resolved tickets reject new
 * messages — the user is asked to open a new ticket instead.
 */
export async function POST(request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { ticketId } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = replySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: ticket, error: tErr } = await admin
    .from("help_tickets")
    .select("ticket_id, user_id, status")
    .eq("ticket_id", ticketId)
    .maybeSingle();
  if (tErr) return Response.json({ error: publicApiError(tErr) }, { status: 500 });
  if (!ticket) return Response.json({ error: "Ticket not found" }, { status: 404 });
  if (ticket.user_id !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (ticket.status === "closed" || ticket.status === "resolved") {
    return Response.json(
      { error: "This ticket is closed. Please open a new ticket if you need more help." },
      { status: 409 },
    );
  }

  const { error: insertErr } = await admin.from("help_ticket_messages").insert({
    ticket_id: ticketId,
    author: "user",
    user_id: userId,
    body: parsed.data.body,
  });
  if (insertErr) return Response.json({ error: publicApiError(insertErr) }, { status: 500 });

  return Response.json({ ok: true });
}

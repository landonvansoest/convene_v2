import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { dispatchHelpTicketReply } from "@/lib/notifications/dispatch";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ticketId: string }> };

const replySchema = z
  .object({
    body: z.string().trim().min(1).max(8000),
    /** Free-form label shown in the email signature and stored alongside the
     *  message (e.g. the admin's email). Optional. */
    admin_label: z.string().trim().max(200).optional(),
    /** If true, mark the ticket as `resolved` after sending the reply. */
    resolve: z.boolean().optional(),
  })
  .strict();

/**
 * Admin replies to a help ticket. The reply is appended to the thread and
 * (best-effort) emailed to the submitter via SendGrid. Per Bible launch
 * constraints, inbound email replies are NOT supported — the notification
 * email links the user back to `/help/[ticketId]` to continue in-app.
 */
export async function POST(request: Request, { params }: Params) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

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
    .select("ticket_id, submitter_email, submitter_name, subject, status")
    .eq("ticket_id", ticketId)
    .maybeSingle();
  if (tErr) return Response.json({ error: publicApiError(tErr) }, { status: 500 });
  if (!ticket) return Response.json({ error: "Ticket not found" }, { status: 404 });

  const adminLabel = parsed.data.admin_label?.trim() || null;

  const { data: inserted, error: insertErr } = await admin
    .from("help_ticket_messages")
    .insert({
      ticket_id: ticketId,
      author: "admin",
      admin_label: adminLabel,
      body: parsed.data.body,
    })
    .select("message_id, created_at")
    .single();
  if (insertErr || !inserted) {
    return Response.json(
      { error: publicApiError(insertErr ?? "Failed to record reply") },
      { status: 500 },
    );
  }

  // Build absolute URL for the in-app reply CTA. Falls back to convene.io
  // when NEXT_PUBLIC_APP_URL is unset (matches welcome-inbox convention).
  const base =
    (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")) ||
    "https://convene.io";
  const threadUrl = `${base}/help/${ticketId}`;

  // SendGrid dispatch is best-effort — the reply is durably recorded above
  // either way. If email succeeds, stamp email_sent_at for audit.
  let emailed = false;
  try {
    emailed = await dispatchHelpTicketReply({
      recipientEmail: ticket.submitter_email,
      recipientName: ticket.submitter_name ?? "",
      subject: ticket.subject,
      body: parsed.data.body,
      threadUrl,
      fromLabel: adminLabel || "Convene Support",
    });
  } catch {
    emailed = false;
  }
  if (emailed) {
    await admin
      .from("help_ticket_messages")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("message_id", inserted.message_id);
  }

  if (parsed.data.resolve) {
    await admin
      .from("help_tickets")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("ticket_id", ticketId);
  }

  return Response.json({ ok: true, emailed });
}

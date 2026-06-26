import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { dispatchHelpTicketReply, resolveHelpTicketInAppMessage } from "@/lib/notifications/dispatch";
import { resolveConveneSupportUserId } from "@/lib/messages/welcome-inbox";

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
    .select(
      "ticket_id, submitter_email, submitter_name, subject, status, conversation_id, user_id",
    )
    .eq("ticket_id", ticketId)
    .maybeSingle();
  if (tErr) return Response.json({ error: publicApiError(tErr) }, { status: 500 });
  if (!ticket) return Response.json({ error: "Ticket not found" }, { status: 404 });

  const adminLabel = parsed.data.admin_label?.trim() || null;
  const fromLabel = adminLabel || "Convene Support";

  // Build absolute URL for the in-app reply CTA. Falls back to convene.io
  // when NEXT_PUBLIC_APP_URL is unset (matches welcome-inbox convention).
  const base =
    (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")) ||
    "https://convene.io";
  const threadUrl = `${base}/dashboard?view=inbox`;
  const inAppMessage = await resolveHelpTicketInAppMessage({
    recipientName: ticket.submitter_name ?? "",
    subject: ticket.subject,
    replyBody: parsed.data.body,
    fromLabel,
    threadUrl,
  });

  // Conversation-backed tickets: store the admin's reply in public.messages so
  // the submitter sees it in their dashboard inbox. Legacy guest tickets fall
  // back to help_ticket_messages.
  let messageId: string | null = null;
  let messageCreatedAt: string | null = null;
  const useConversation = !!ticket.conversation_id;
  let supportUserId: string | null = null;

  if (useConversation) {
    supportUserId = await resolveConveneSupportUserId(admin);
    if (!supportUserId) {
      return Response.json(
        {
          error:
            "Convene Support user not configured. Set CONVENE_SUPPORT_USER_ID or CONVENE_SUPPORT_EMAIL (or CONVENE_TEAM_USER_ID as a fallback) in apps/web env so admin replies can be attributed to a sender.",
        },
        { status: 500 },
      );
    }
    const { data: inserted, error: insertErr } = await admin
      .from("messages")
      .insert({
        conversation_id: ticket.conversation_id,
        sender_id: supportUserId,
        message: inAppMessage,
        is_read: false,
        metadata: {
          help_ticket_id: ticket.ticket_id,
          admin_label: adminLabel ?? undefined,
        },
      })
      .select("message_id, created_at")
      .single();
    if (insertErr || !inserted) {
      return Response.json(
        { error: publicApiError(insertErr ?? "Failed to record reply") },
        { status: 500 },
      );
    }
    messageId = inserted.message_id;
    messageCreatedAt = inserted.created_at;

    await admin
      .from("conversations")
      .update({ updated_at: inserted.created_at, last_message_at: inserted.created_at })
      .eq("conversation_id", ticket.conversation_id);
  } else {
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
    messageId = inserted.message_id;
    messageCreatedAt = inserted.created_at;
  }

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
      fromLabel,
    });
  } catch {
    emailed = false;
  }
  if (emailed && messageId) {
    if (useConversation) {
      await admin
        .from("messages")
        .update({
          metadata: {
            help_ticket_id: ticket.ticket_id,
            admin_label: adminLabel ?? undefined,
            email_sent_at: new Date().toISOString(),
          },
        })
        .eq("message_id", messageId);
    } else {
      await admin
        .from("help_ticket_messages")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("message_id", messageId);
    }
  }

  if (parsed.data.resolve) {
    await admin
      .from("help_tickets")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("ticket_id", ticketId);
  }

  return Response.json({ ok: true, emailed, message_id: messageId, created_at: messageCreatedAt });
}

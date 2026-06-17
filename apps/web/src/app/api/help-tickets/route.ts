import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { findOrCreateConversationForPair, getAuthedUserId } from "@/lib/messages/service";
import { dispatchHelpTicketAlert } from "@/lib/notifications/admin-alerts";
import { resolveConveneSupportUserId } from "@/lib/messages/welcome-inbox";

export const dynamic = "force-dynamic";

/**
 * Submit a help ticket (Bible §"Admin tools — Help Tickets"). Authenticated
 * users can omit email/name (we'll read it from their profile). Guest
 * visitors must supply an email so admins have a reply address.
 *
 * The first message in the thread is duplicated from `body` so the admin
 * inbox can render the conversation without a second fetch.
 */
const submitSchema = z
  .object({
    subject: z.string().trim().min(3).max(200),
    body: z.string().trim().min(1).max(8000),
    email: z.string().email().max(200).optional(),
    name: z.string().trim().max(120).optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = submitSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { subject, body, context } = parsed.data;
  const admin = createAdminClient();

  // Identity resolution: prefer the signed-in user's profile (it's the
  // canonical record). Guests must supply their own email.
  const authedUserId = await getAuthedUserId();
  const userId: string | null = authedUserId;
  let submitterEmail = (parsed.data.email ?? "").trim();
  let submitterName = (parsed.data.name ?? "").trim();

  if (authedUserId) {
    const { data: u } = await admin
      .from("users")
      .select("user_id, first_name, last_name, email_address")
      .eq("user_id", authedUserId)
      .maybeSingle();
    if (u) {
      if (!submitterEmail) submitterEmail = (u.email_address ?? "").trim();
      if (!submitterName) {
        const n = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
        if (n) submitterName = n;
      }
    }
  }

  if (!submitterEmail) {
    return Response.json(
      { error: "Email is required when submitting a help ticket as a guest." },
      { status: 400 },
    );
  }

  const { data: ticket, error: insertErr } = await admin
    .from("help_tickets")
    .insert({
      user_id: userId,
      submitter_email: submitterEmail,
      submitter_name: submitterName || null,
      subject,
      status: "open",
      context: context ?? {},
    })
    .select("ticket_id")
    .single();

  if (insertErr || !ticket) {
    return Response.json(
      { error: publicApiError(insertErr ?? "Failed to create ticket") },
      { status: 500 },
    );
  }

  // Mirror the ticket into the conversations/messages inbox for authenticated
  // submitters. The thread between the user and the Convene Support team
  // becomes the source of truth — the admin Help Tickets view reads from it,
  // and the submitter sees + replies to it from their dashboard inbox.
  //
  // Guests have no user_id and therefore can't be in a conversation; they
  // continue to use the legacy help_ticket_messages append-only thread.
  let conversationId: string | null = null;
  if (userId) {
    try {
      const supportUserId = await resolveConveneSupportUserId(admin);
      if (supportUserId && supportUserId !== userId) {
        const convo = await findOrCreateConversationForPair(userId, supportUserId);
        const { data: openingMsg, error: openingErr } = await admin
          .from("messages")
          .insert({
            conversation_id: convo.conversation_id,
            sender_id: userId,
            message: body,
            is_read: false,
            metadata: {
              help_ticket_id: ticket.ticket_id,
              help_ticket_subject: subject,
              help_ticket_initial: true,
            },
          })
          .select("message_id, created_at")
          .single();
        if (openingErr) throw new Error(openingErr.message);

        await admin
          .from("conversations")
          .update({
            updated_at: openingMsg.created_at,
            last_message_at: openingMsg.created_at,
          })
          .eq("conversation_id", convo.conversation_id);

        await admin
          .from("help_tickets")
          .update({ conversation_id: convo.conversation_id })
          .eq("ticket_id", ticket.ticket_id);

        conversationId = convo.conversation_id;
      } else {
        console.warn(
          "[help-tickets] No Convene Support user resolved; ticket stored in legacy help_ticket_messages only. Set CONVENE_SUPPORT_USER_ID or CONVENE_SUPPORT_EMAIL (or CONVENE_TEAM_USER_ID as a fallback) in apps/web env.",
        );
      }
    } catch (e) {
      console.error("[help-tickets] conversation mirror failed", e);
    }
  }

  // Always record the opening message on the legacy thread. For conversation-
  // backed tickets it serves as an immutable audit trail; for guests it is the
  // source of truth that the admin inbox renders directly.
  const { error: msgErr } = await admin.from("help_ticket_messages").insert({
    ticket_id: ticket.ticket_id,
    author: "user",
    user_id: userId,
    body,
    is_initial: true,
  });

  if (msgErr) {
    return Response.json({ error: publicApiError(msgErr) }, { status: 500 });
  }

  try {
    await dispatchHelpTicketAlert({
      ticketId: ticket.ticket_id,
      subject,
      body,
      submitterEmail,
      submitterName: submitterName || null,
      isAuthenticated: Boolean(authedUserId),
    });
  } catch (e) {
    console.error("[help-tickets] admin alert", e);
  }

  return Response.json({
    ok: true,
    ticket_id: ticket.ticket_id,
    conversation_id: conversationId,
  });
}

/**
 * List help tickets owned by the currently signed-in user (for a future "My
 * support tickets" view). Guest tickets aren't returned here — guests use
 * the direct `/help/[ticketId]` link from the confirmation email.
 */
export async function GET() {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ tickets: [] });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("help_tickets")
    .select(
      "ticket_id, subject, status, last_message_preview, last_message_at, last_author, created_at, updated_at",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  return Response.json({ tickets: data ?? [] });
}

import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { resolveConveneSupportUserId } from "@/lib/messages/welcome-inbox";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ticketId: string }> };

const patchSchema = z
  .object({
    status: z.enum(["open", "awaiting_user", "resolved", "closed"]).optional(),
    assigned_admin: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

/** Fetch a full thread (ticket + messages) for the admin detail pane. */
export async function GET(request: Request, { params }: Params) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const { ticketId } = await params;
  const admin = createAdminClient();

  const { data: ticket, error: tErr } = await admin
    .from("help_tickets")
    .select(
      "ticket_id, user_id, submitter_email, submitter_name, subject, status, context, assigned_admin, resolved_at, created_at, updated_at, conversation_id",
    )
    .eq("ticket_id", ticketId)
    .maybeSingle();
  if (tErr) return Response.json({ error: publicApiError(tErr) }, { status: 500 });
  if (!ticket) return Response.json({ error: "Ticket not found" }, { status: 404 });

  // Conversation-backed tickets: render the thread from public.messages so the
  // admin sees user replies that came in through the dashboard inbox. Guest
  // tickets (no conversation_id) keep the legacy help_ticket_messages render.
  type ThreadMessage = {
    message_id: string;
    author: "user" | "admin" | "system";
    admin_label: string | null;
    body: string;
    is_initial: boolean;
    email_sent_at: string | null;
    created_at: string;
  };

  let messages: ThreadMessage[] = [];

  if (ticket.conversation_id) {
    const supportUserId = await resolveConveneSupportUserId(admin);
    const { data: rows, error: mErr } = await admin
      .from("messages")
      .select("message_id, sender_id, message, created_at, metadata")
      .eq("conversation_id", ticket.conversation_id)
      .order("created_at", { ascending: true });
    if (mErr) return Response.json({ error: publicApiError(mErr) }, { status: 500 });

    messages = (rows ?? []).map((m): ThreadMessage => {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      const isSubmitter = ticket.user_id && m.sender_id === ticket.user_id;
      const isSupport = supportUserId && m.sender_id === supportUserId;
      const author: ThreadMessage["author"] = isSubmitter ? "user" : isSupport ? "admin" : "admin";
      return {
        message_id: m.message_id,
        author,
        admin_label: typeof meta.admin_label === "string" ? meta.admin_label : null,
        body: m.message,
        is_initial: meta.help_ticket_initial === true,
        email_sent_at:
          typeof meta.email_sent_at === "string" ? meta.email_sent_at : null,
        created_at: m.created_at,
      };
    });
  } else {
    const { data: rows, error: mErr } = await admin
      .from("help_ticket_messages")
      .select("message_id, author, admin_label, body, is_initial, email_sent_at, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    if (mErr) return Response.json({ error: publicApiError(mErr) }, { status: 500 });
    messages = (rows ?? []) as ThreadMessage[];
  }

  let user: { user_id: string; first_name: string | null; last_name: string | null; email_address: string | null; profile_photo: string | null } | null = null;
  if (ticket.user_id) {
    const { data } = await admin
      .from("users")
      .select("user_id, first_name, last_name, email_address, profile_photo")
      .eq("user_id", ticket.user_id)
      .maybeSingle();
    user = data ?? null;
  }

  return Response.json({ ticket, messages, user });
}

/** Update ticket status or assignment. */
export async function PATCH(request: Request, { params }: Params) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const { ticketId } = await params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  if (parsed.data.status === undefined && parsed.data.assigned_admin === undefined) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.status !== undefined) {
    payload.status = parsed.data.status;
    payload.resolved_at = parsed.data.status === "resolved" ? new Date().toISOString() : null;
  }
  if (parsed.data.assigned_admin !== undefined) {
    payload.assigned_admin = parsed.data.assigned_admin || null;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("help_tickets").update(payload).eq("ticket_id", ticketId);
  if (error) return Response.json({ error: publicApiError(error) }, { status: 500 });

  return Response.json({ ok: true });
}

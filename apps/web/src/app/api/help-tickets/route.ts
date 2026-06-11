import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { getAuthedUserId } from "@/lib/messages/service";

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

  // Append the opening message; the parent trigger refreshes last_message_*.
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

  return Response.json({ ok: true, ticket_id: ticket.ticket_id });
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

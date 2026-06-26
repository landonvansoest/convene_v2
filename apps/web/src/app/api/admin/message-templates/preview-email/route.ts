import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { buildTransactionalEmailPayload } from "@/lib/notifications/email-layout";
import { buildDashboardUrlVars } from "@/lib/notifications/booking-template-vars";
import { renderMessageTemplate } from "@/lib/notifications/message-templates";

export const dynamic = "force-dynamic";

function previewBaseUrl(): string {
  return (
    (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")) ||
    "https://convene.io"
  );
}

const bodySchema = z
  .object({
    email_subject: z.string().max(500).optional(),
    email_body: z.string().max(20000),
    email_cta_url: z.string().max(2000).optional(),
    email_cta_label: z.string().max(200).optional(),
    sample_vars: z.record(z.string(), z.string()).optional(),
  })
  .strict();

const SAMPLE_VARS: Record<string, string> = {
  recipient_name: "Alex Johnson",
  sender_name: "Jordan Lee",
  expert_name: "Dr. Smith",
  learner_name: "Alex Johnson",
  other_party_name: "Jordan Lee",
  session_date: "Wednesday, June 25, 2025",
  session_time: "2:00 PM",
  session_start_time: "2:00 PM",
  session_end_time: "2:45 PM",
  session_duration: "45 minutes",
  session_fee: "$68.18",
  total_paid: "$75.00",
  refund_amount: "$75.00",
  refund_status: "A full refund has been issued.",
  time_zone: "America/New_York",
  session_link: `${previewBaseUrl()}/session/example-booking-id`,
  calendar_link: `${previewBaseUrl()}/api/calendar/booking/example-booking-id.ics`,
  message_preview: "Looking forward to our session!",
  ...buildDashboardUrlVars(previewBaseUrl()),
  browse_url: `${previewBaseUrl()}/search`,
  expert_profile_url: `${previewBaseUrl()}/experts/example-expert-id`,
  similar_experts_list:
    `• [Jordan Lee](${previewBaseUrl()}/experts/example-expert-2)\n` +
    `• [Dr. Smith](${previewBaseUrl()}/experts/example-expert-3)`,
  similar_experts_section:
    `• [Jordan Lee](${previewBaseUrl()}/experts/example-expert-2)\n` +
    `• [Dr. Smith](${previewBaseUrl()}/experts/example-expert-3)`,
  post_request_url: `${previewBaseUrl()}/requests`,
  profile_url: `${previewBaseUrl()}/experts/example-expert-id`,
  book_url: `${previewBaseUrl()}/sessions?expert=example-expert-id`,
  account_url: `${previewBaseUrl()}/account`,
  package_title: "5-session bundle",
  credit_count: "5",
  remaining_credits: "3",
  expiration_date: "December 31, 2026",
  days_until_expiry_label: "1 week",
  ticket_subject: "Billing question",
  reply_body: "Thanks for reaching out — here is how to update your payment method.",
  from_label: "Convene Support",
  thread_url: `${previewBaseUrl()}/dashboard?view=inbox`,
};

/** Render admin template copy inside the global transactional email shell. */
export async function POST(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const vars = { ...SAMPLE_VARS, ...(parsed.data.sample_vars ?? {}) };
  const bodyText = renderMessageTemplate(parsed.data.email_body, vars);
  const subject = parsed.data.email_subject
    ? renderMessageTemplate(parsed.data.email_subject, vars)
    : "Convene email preview";

  const ctaUrlRaw = (parsed.data.email_cta_url ?? "").trim();
  const ctaLabelRaw = (parsed.data.email_cta_label ?? "").trim();
  const ctaUrl = ctaUrlRaw ? renderMessageTemplate(ctaUrlRaw, vars).trim() : "";
  const ctaLabel = ctaLabelRaw ? renderMessageTemplate(ctaLabelRaw, vars).trim() : "";
  const { text, html } = buildTransactionalEmailPayload(bodyText, {
    ctaUrl: ctaUrl && ctaLabel ? ctaUrl : null,
    ctaLabel: ctaUrl && ctaLabel ? ctaLabel : null,
    preheader: subject,
  });

  return Response.json({ subject, text, html });
}

import type { createAdminClient } from "@/lib/supabase/admin";

export type MessageTemplateRow = {
  template_id: string;
  automation_key: string;
  automation_label: string;
  automation_description: string;
  in_app_enabled: boolean;
  in_app_subject: string;
  in_app_body: string;
  email_enabled: boolean;
  email_subject: string;
  email_body: string;
  sms_enabled: boolean;
  sms_body: string;
  display_order: number;
};

export type AutomationChannel = "in_app" | "email" | "sms";

export type AutomationCatalogEntry = {
  automation_key: string;
  automation_label: string;
  when_it_sends: string;
  wired_channels: AutomationChannel[];
  notes?: string;
};

/** Human-readable catalog — shown in admin even before migration 034 is applied. */
export const AUTOMATION_CATALOG: AutomationCatalogEntry[] = [
  {
    automation_key: "new_message",
    automation_label: "New direct message",
    when_it_sends: "Automatically when a user receives a new DM (in-app send + notification webhook).",
    wired_channels: ["email", "sms"],
    notes: "The DM itself always appears in inbox; in-app template fields are reserved for a future inbox notification row.",
  },
  {
    automation_key: "booking_confirmed",
    automation_label: "Booking confirmed",
    when_it_sends: "Automatically when session payment succeeds (Stripe webhook / payment finalize).",
    wired_channels: ["email", "sms"],
  },
  {
    automation_key: "booking_reminder",
    automation_label: "Upcoming session reminder",
    when_it_sends: "Automatically ~15 minutes before session start (cron: check-booking-reminders, every 2 min).",
    wired_channels: ["email", "sms"],
  },
  {
    automation_key: "booking_canceled",
    automation_label: "Booking canceled",
    when_it_sends: "Automatically when a learner or expert cancels a booking (session status → cancelled).",
    wired_channels: ["email", "sms"],
  },
  {
    automation_key: "refund_issued",
    automation_label: "Refund issued",
    when_it_sends: "Automatically when an admin issues a Stripe refund from Booking Problems.",
    wired_channels: ["email"],
    notes: "Admin can still send a custom in-app DM in the refund dialog; that text is not templated.",
  },
  {
    automation_key: "expert_approved",
    automation_label: "Expert registration approved",
    when_it_sends: "Automatically when an admin approves a pending expert (Admin → Experts).",
    wired_channels: ["email", "in_app"],
  },
  {
    automation_key: "welcome_learner",
    automation_label: "Welcome (new learner)",
    when_it_sends: "Automatically once after signup (welcome inbox DM on first dashboard / GET /api/me).",
    wired_channels: ["in_app"],
    notes: "Email fields are available to enable later; signup email confirm is handled by Supabase Auth.",
  },
  {
    automation_key: "expert_registration_welcome",
    automation_label: "Expert registration submitted",
    when_it_sends: "Automatically once after an expert completes registration submit.",
    wired_channels: ["in_app"],
  },
  {
    automation_key: "help_ticket_reply",
    automation_label: "Help ticket admin reply",
    when_it_sends: "When an admin replies to a help ticket (Admin → Help Tickets). Email only — user continues in-app at /help/[id].",
    wired_channels: ["email"],
  },
];

const SELECT_COLS =
  "template_id, automation_key, automation_label, automation_description, " +
  "in_app_enabled, in_app_subject, in_app_body, " +
  "email_enabled, email_subject, email_body, " +
  "sms_enabled, sms_body, display_order";

/** Default copy (migration 034/049 seeds match these). Used when DB row is missing. */
export const TEMPLATE_FALLBACKS: Record<string, Omit<MessageTemplateRow, "template_id">> = {
  new_message: {
    automation_key: "new_message",
    automation_label: "New direct message",
    automation_description: AUTOMATION_CATALOG[0].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "New message from {{sender_name}}",
    in_app_body: "{{sender_name}} sent you a message on Convene:\n\n{{message_preview}}",
    email_enabled: true,
    email_subject: "New message from {{sender_name}}",
    email_body:
      "Hi {{recipient_name}},\n\n{{sender_name}} sent you a message on Convene:\n\n{{message_preview}}\n\nOpen inbox: {{inbox_url}}",
    sms_enabled: false,
    sms_body: "{{sender_name}}: {{message_preview}}",
    display_order: 10,
  },
  booking_confirmed: {
    automation_key: "booking_confirmed",
    automation_label: "Booking confirmed",
    automation_description: AUTOMATION_CATALOG[1].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "Session confirmed with {{other_party_name}}",
    in_app_body:
      "Your session with {{other_party_name}} is confirmed for {{session_date}} at {{session_time}}.",
    email_enabled: true,
    email_subject: "Session confirmed: {{session_date}} at {{session_time}}",
    email_body:
      "Hi {{recipient_name}},\n\nYour Convene session is confirmed.\n\nWith: {{other_party_name}}\nWhen: {{session_date}} at {{session_time}} ({{time_zone}})\nJoin link: {{session_link}}\n\nSee you then!",
    sms_enabled: false,
    sms_body:
      "Convene: session with {{other_party_name}} confirmed for {{session_date}} {{session_time}}.",
    display_order: 20,
  },
  booking_reminder: {
    automation_key: "booking_reminder",
    automation_label: "Upcoming session reminder",
    automation_description: AUTOMATION_CATALOG[2].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "Reminder: session on {{session_date}}",
    in_app_body:
      "Your Convene session with {{other_party_name}} starts at {{session_time}}. Join: {{session_link}}",
    email_enabled: true,
    email_subject: "Reminder: session on {{session_date}}",
    email_body:
      "Hi {{recipient_name}},\n\nYour Convene session is coming up.\n\nWith: {{other_party_name}}\nWhen: {{session_date}} at {{session_time}}\nJoin: {{session_link}}",
    sms_enabled: true,
    sms_body: "Convene: session {{session_date}} {{session_time}}. {{session_link}}",
    display_order: 30,
  },
  booking_canceled: {
    automation_key: "booking_canceled",
    automation_label: "Booking canceled",
    automation_description: AUTOMATION_CATALOG[3].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "Session canceled",
    in_app_body:
      "Your session with {{other_party_name}} on {{session_date}} has been canceled. {{refund_status}}",
    email_enabled: true,
    email_subject: "Session canceled: {{session_date}}",
    email_body:
      "Hi {{recipient_name}},\n\nYour Convene session with {{other_party_name}} on {{session_date}} has been canceled.\n\n{{refund_status}}\n\nIf this was a mistake, you can rebook from their profile.",
    sms_enabled: false,
    sms_body: "Convene: session {{session_date}} canceled. {{refund_status}}",
    display_order: 40,
  },
  refund_issued: {
    automation_key: "refund_issued",
    automation_label: "Refund issued",
    automation_description: AUTOMATION_CATALOG[4].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "Refund issued",
    in_app_body:
      "We issued a {{refund_amount}} refund for your session on {{session_date}}. It should post to your card within 5–10 business days.",
    email_enabled: true,
    email_subject: "Refund issued for {{session_date}}",
    email_body:
      "Hi {{recipient_name}},\n\nWe issued a {{refund_amount}} refund for your Convene session on {{session_date}}.\n\nIt should post to your original payment method within 5–10 business days.\n\nIf you have questions, reply to this email.",
    sms_enabled: false,
    sms_body: "Convene: {{refund_amount}} refund issued for {{session_date}}.",
    display_order: 50,
  },
  expert_approved: {
    automation_key: "expert_approved",
    automation_label: "Expert registration approved",
    automation_description: AUTOMATION_CATALOG[5].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "You're approved on Convene",
    in_app_body:
      "Welcome to Convene! Your expert profile is live. Visit your dashboard to publish availability and start receiving bookings.",
    email_enabled: true,
    email_subject: "You're approved on Convene",
    email_body:
      "Hi {{recipient_name}},\n\nGreat news — your Convene expert profile has been approved and is now live on the platform.\n\nNext steps:\n• Publish your weekly availability.\n• Set your session pricing.\n• Share your profile link: {{profile_url}}\n\nWelcome aboard!",
    sms_enabled: false,
    sms_body: "",
    display_order: 60,
  },
  welcome_learner: {
    automation_key: "welcome_learner",
    automation_label: "Welcome (new learner)",
    automation_description: AUTOMATION_CATALOG[6].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "Welcome to Convene",
    in_app_body:
      "Welcome to convene! 🎉\n\nWe're thrilled you've joined our community.\n\n Here are some tips to get started:\n\n• Browse experts in your area of interest\n• Message experts to find a good fit\n• Post requests and have experts come to you\n• Join our community message boards to engage with other users\n\nHappy learning!",
    email_enabled: true,
    email_subject: "Welcome to Convene",
    email_body:
      "Hi {{recipient_name}},\n\nWelcome to Convene — glad to have you.\n\nHere are three ways to get rolling:\n• Browse experts: {{browse_url}}\n• Post a request: {{post_request_url}}\n• Complete your profile: {{profile_url}}\n\nReply to this email anytime if you need a hand.",
    sms_enabled: false,
    sms_body: "",
    display_order: 70,
  },
  expert_registration_welcome: {
    automation_key: "expert_registration_welcome",
    automation_label: "Expert registration submitted",
    automation_description: AUTOMATION_CATALOG[7].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "Thanks for registering as an expert",
    in_app_body:
      "Thank you for sharing your expertise! We're excited for you to engage with our community of learners.\n\nHere are some tips to get started:\n\n• Browse our community message boards to interact with learners\n• Send custom offers to book your first sessions\n• Share the url to your Expert Profile ({{profile_url}}) on your personal and social networks\n• Check out our Expert coaching resources for tips on maximizing your bookings\n\nHappy coaching!",
    email_enabled: false,
    email_subject: "",
    email_body: "",
    sms_enabled: false,
    sms_body: "",
    display_order: 75,
  },
  help_ticket_reply: {
    automation_key: "help_ticket_reply",
    automation_label: "Help ticket admin reply",
    automation_description: AUTOMATION_CATALOG[8].when_it_sends,
    in_app_enabled: false,
    in_app_subject: "",
    in_app_body: "",
    email_enabled: true,
    email_subject: "Re: {{ticket_subject}}",
    email_body:
      "Hi {{recipient_name}},\n\n{{reply_body}}\n\n—\n{{from_label}}\n\nReply in Convene to keep this conversation in one place:\n{{thread_url}}\n\n(Replies to this email are not monitored — please use the link above.)",
    sms_enabled: false,
    sms_body: "",
    display_order: 80,
  },
};

export function renderMessageTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

type Admin = ReturnType<typeof createAdminClient>;

export async function fetchMessageTemplate(
  admin: Admin,
  automationKey: string,
): Promise<MessageTemplateRow | null> {
  const { data, error } = await admin
    .from("message_templates")
    .select(SELECT_COLS)
    .eq("automation_key", automationKey)
    .maybeSingle();

  if (error) {
    const missing =
      error.code === "42P01" ||
      /relation .*message_templates.* does not exist/i.test(error.message ?? "");
    if (missing) {
      const fb = TEMPLATE_FALLBACKS[automationKey];
      return fb ? { template_id: "", ...fb } : null;
    }
    console.error("[message-templates] fetch failed", automationKey, error.message);
    const fb = TEMPLATE_FALLBACKS[automationKey];
    return fb ? { template_id: "", ...fb } : null;
  }

  if (!data) {
    const fb = TEMPLATE_FALLBACKS[automationKey];
    return fb ? { template_id: "", ...fb } : null;
  }

  return data as unknown as MessageTemplateRow;
}

export function resolveEmailFromTemplate(
  row: MessageTemplateRow | null,
  vars: Record<string, string>,
  fallback: { subject: string; body: string },
): { enabled: boolean; subject: string; body: string } {
  if (!row || !row.email_enabled) {
    return { enabled: false, subject: fallback.subject, body: fallback.body };
  }
  return {
    enabled: true,
    subject: renderMessageTemplate(row.email_subject || fallback.subject, vars),
    body: renderMessageTemplate(row.email_body || fallback.body, vars),
  };
}

export function resolveSmsFromTemplate(
  row: MessageTemplateRow | null,
  vars: Record<string, string>,
  fallback: string,
): { enabled: boolean; body: string } {
  if (!row || !row.sms_enabled) {
    return { enabled: false, body: fallback };
  }
  return {
    enabled: true,
    body: renderMessageTemplate(row.sms_body || fallback, vars),
  };
}

export function resolveInAppFromTemplate(
  row: MessageTemplateRow | null,
  vars: Record<string, string>,
  fallback: { subject: string; body: string },
): { enabled: boolean; subject: string; body: string } {
  if (!row || !row.in_app_enabled) {
    return { enabled: false, subject: fallback.subject, body: fallback.body };
  }
  return {
    enabled: true,
    subject: renderMessageTemplate(row.in_app_subject || fallback.subject, vars),
    body: renderMessageTemplate(row.in_app_body || fallback.body, vars),
  };
}

export function catalogForKey(automationKey: string): AutomationCatalogEntry | undefined {
  return AUTOMATION_CATALOG.find((c) => c.automation_key === automationKey);
}

/**
 * Reference for admin Message Templates — which {{placeholders}} exist and where they apply.
 * Keep in sync with booking-template-vars.ts, dispatch.ts, and notification senders.
 */

const BOOKING_REQUEST_AUTOMATIONS = [
  "booking_request_approved",
  "booking_request_declined",
] as const;

const RESCHEDULE_ACCEPTED_AUTOMATIONS = [
  "booking_reschedule_accepted_learner",
  "booking_reschedule_accepted_expert",
] as const;

const CANCEL_AUTOMATIONS = [
  "booking_canceled",
  "booking_canceled_by_expert",
  "booking_canceled_by_learner",
] as const;

export type TemplateVariableEntry = {
  /** Placeholder without braces, e.g. session_fee */
  key: string;
  description: string;
  example: string;
  /** automation_key values where this is populated at send time */
  automations: string[];
};

export const TEMPLATE_VARIABLE_REFERENCE: TemplateVariableEntry[] = [
  {
    key: "recipient_name",
    description: "Display name of the person receiving this message",
    example: "Alex Johnson",
    automations: ["*"],
  },
  {
    key: "sender_name",
    description: "Display name of the person who sent a direct message",
    example: "Jordan Lee",
    automations: ["new_message"],
  },
  {
    key: "message_preview",
    description: "Incoming DM body for email (truncated at 800 chars; SMS uses first 140 chars)",
    example: "Looking forward to our session!",
    automations: ["new_message"],
  },
  {
    key: "expert_name",
    description: "Booked expert’s display name",
    example: "Dr. Smith",
    automations: [
      "booking_confirmed",
      "new_booking",
      "booking_reminder",
      ...CANCEL_AUTOMATIONS,
      ...BOOKING_REQUEST_AUTOMATIONS,
      ...RESCHEDULE_ACCEPTED_AUTOMATIONS,
      "expert_no_show_refund",
      "package_purchased",
      "package_credit_expiring",
    ],
  },
  {
    key: "learner_name",
    description: "Learner’s display name",
    example: "Alex Johnson",
    automations: [
      "booking_confirmed",
      "new_booking",
      "booking_reminder",
      ...CANCEL_AUTOMATIONS,
      ...RESCHEDULE_ACCEPTED_AUTOMATIONS,
    ],
  },
  {
    key: "other_party_name",
    description: "The other person in the session (expert or learner, relative to recipient)",
    example: "Jordan Lee",
    automations: ["booking_reminder", ...CANCEL_AUTOMATIONS],
  },
  {
    key: "session_date",
    description: "Session date (long format)",
    example: "Wednesday, June 25, 2025",
    automations: [
      "booking_confirmed",
      "new_booking",
      "booking_reminder",
      ...CANCEL_AUTOMATIONS,
      ...BOOKING_REQUEST_AUTOMATIONS,
      ...RESCHEDULE_ACCEPTED_AUTOMATIONS,
      "refund_issued",
      "expert_no_show_refund",
    ],
  },
  {
    key: "session_time",
    description: "Session start time (same as session_start_time)",
    example: "2:00 PM",
    automations: [
      "booking_confirmed",
      "new_booking",
      "booking_reminder",
      ...CANCEL_AUTOMATIONS,
      ...BOOKING_REQUEST_AUTOMATIONS,
      ...RESCHEDULE_ACCEPTED_AUTOMATIONS,
      "expert_no_show_refund",
    ],
  },
  {
    key: "session_start_time",
    description: "Session start time",
    example: "2:00 PM",
    automations: [
      "booking_confirmed",
      "new_booking",
      "booking_reminder",
      ...CANCEL_AUTOMATIONS,
      "refund_issued",
      "expert_no_show_refund",
    ],
  },
  {
    key: "session_end_time",
    description: "Session end time",
    example: "2:45 PM",
    automations: [
      "booking_confirmed",
      "new_booking",
      "booking_reminder",
      ...CANCEL_AUTOMATIONS,
      "refund_issued",
      "expert_no_show_refund",
    ],
  },
  {
    key: "session_duration",
    description: "Human-readable session length",
    example: "45 minutes",
    automations: [
      "booking_confirmed",
      "new_booking",
      "booking_reminder",
      ...CANCEL_AUTOMATIONS,
      "refund_issued",
      "expert_no_show_refund",
    ],
  },
  {
    key: "session_fee",
    description: "Expert session fee (bookings.booking_amount — before platform fee & tax)",
    example: "$68.18",
    automations: [
      "booking_confirmed",
      "new_booking",
      "booking_reminder",
      ...CANCEL_AUTOMATIONS,
      "refund_issued",
      "expert_no_show_refund",
    ],
  },
  {
    key: "total_paid",
    description: "Full checkout total paid by the learner (bookings.total_amount)",
    example: "$75.00",
    automations: [
      "booking_confirmed",
      "new_booking",
      "booking_reminder",
      ...CANCEL_AUTOMATIONS,
      "refund_issued",
      "expert_no_show_refund",
    ],
  },
  {
    key: "time_zone",
    description: "Recipient’s IANA timezone",
    example: "America/New_York",
    automations: ["booking_confirmed", "new_booking", ...CANCEL_AUTOMATIONS, ...RESCHEDULE_ACCEPTED_AUTOMATIONS],
  },
  {
    key: "expert_profile_url",
    description:
      "Public profile URL for the expert on this booking. Pair with expert_name using markdown: [{{expert_name}}]({{expert_profile_url}}) — renders as a clickable link in email and in-app messages.",
    example: "https://convene.io/experts/{expert_user_id}",
    automations: [...CANCEL_AUTOMATIONS, ...BOOKING_REQUEST_AUTOMATIONS],
  },
  {
    key: "expert_message",
    description: "Personal note from the expert when approving or declining a booking request",
    example: "Looking forward to our session!",
    automations: [...BOOKING_REQUEST_AUTOMATIONS],
  },
  {
    key: "session_link",
    description: "Join URL for this specific session",
    example: "https://convene.io/session/{booking_id}",
    automations: [
      "booking_confirmed",
      "new_booking",
      "booking_reminder",
      ...CANCEL_AUTOMATIONS,
      ...RESCHEDULE_ACCEPTED_AUTOMATIONS,
    ],
  },
  {
    key: "calendar_link",
    description: "Download .ics calendar file for this booking (also attached to confirmation emails)",
    example: "https://convene.io/api/calendar/booking/{booking_id}.ics",
    automations: ["booking_confirmed", "new_booking", ...RESCHEDULE_ACCEPTED_AUTOMATIONS],
  },
  {
    key: "bookings_url",
    description: "Dashboard → Booked Sessions",
    example: "https://convene.io/dashboard?view=sessions",
    automations: [
      "booking_confirmed",
      "new_booking",
      "booking_reminder",
      ...CANCEL_AUTOMATIONS,
      ...BOOKING_REQUEST_AUTOMATIONS,
      ...RESCHEDULE_ACCEPTED_AUTOMATIONS,
      "refund_issued",
      "expert_no_show_refund",
    ],
  },
  {
    key: "sessions_url",
    description: "Alias for bookings_url (dashboard Booked Sessions)",
    example: "https://convene.io/dashboard?view=sessions",
    automations: [
      "booking_confirmed",
      "new_booking",
      "booking_reminder",
      ...CANCEL_AUTOMATIONS,
      ...BOOKING_REQUEST_AUTOMATIONS,
      "refund_issued",
      "expert_no_show_refund",
    ],
  },
  {
    key: "inbox_url",
    description: "Dashboard → Inbox",
    example: "https://convene.io/dashboard?view=inbox",
    automations: ["new_message", "help_ticket_reply"],
  },
  {
    key: "dashboard_url",
    description: "Dashboard overview (expert no-show refund CTA default)",
    example: "https://convene.io/dashboard?view=inbox",
    automations: ["expert_no_show_refund"],
  },
  {
    key: "refund_status",
    description: "Cancellation refund explanation",
    example: "A full refund has been issued.",
    automations: [...CANCEL_AUTOMATIONS, ...BOOKING_REQUEST_AUTOMATIONS],
  },
  {
    key: "similar_experts_list",
    description:
      "Up to 3 similar experts as markdown hyperlinks [Name](profile_url) — skills match first, then same category. Renders as clickable links in email and in-app.",
    example: "• [Jordan Lee](https://convene.io/experts/…)\n• [Dr. Smith](https://convene.io/experts/…)",
    automations: ["booking_canceled_by_expert", "booking_request_declined"],
  },
  {
    key: "similar_experts_section",
    description: "Same as similar_experts_list — hyperlinked expert names only (no intro text)",
    example: "• [Jordan Lee](https://convene.io/experts/…)\n• [Dr. Smith](https://convene.io/experts/…)",
    automations: ["booking_canceled_by_expert", "booking_request_declined"],
  },
  {
    key: "refund_amount",
    description: "Dollar amount refunded",
    example: "$75.00",
    automations: ["refund_issued", "expert_no_show_refund"],
  },
  {
    key: "profile_url",
    description:
      "Expert public profile or learner profile link. In email: [Complete your profile]({{profile_url}})",
    example: "https://convene.io/experts/{user_id}",
    automations: ["expert_approved", "welcome_learner", "expert_registration_welcome"],
  },
  {
    key: "browse_url",
    description:
      "Expert search / browse page. In email bodies use as a hyperlink: [Browse experts]({{browse_url}})",
    example: "https://convene.io/search",
    automations: ["welcome_learner", "booking_canceled_by_expert", "booking_request_declined"],
  },
  {
    key: "post_request_url",
    description:
      "Community requests page. In email: [Post a request]({{post_request_url}})",
    example: "https://convene.io/requests",
    automations: ["welcome_learner"],
  },
  {
    key: "book_url",
    description: "Book a session with the package expert",
    example: "https://convene.io/sessions?expert={user_id}",
    automations: ["package_purchased", "package_credit_expiring"],
  },
  {
    key: "account_url",
    description: "Account / credits page",
    example: "https://convene.io/account",
    automations: ["package_purchased", "package_credit_expiring"],
  },
  {
    key: "package_title",
    description: "Purchased package name",
    example: "5-session bundle",
    automations: ["package_purchased", "package_credit_expiring"],
  },
  {
    key: "credit_count",
    description: "Number of sessions in a purchased package",
    example: "5",
    automations: ["package_purchased"],
  },
  {
    key: "remaining_credits",
    description: "Unused package credits left",
    example: "3",
    automations: ["package_credit_expiring"],
  },
  {
    key: "expiration_date",
    description: "Package credits expiration (long date)",
    example: "December 31, 2026",
    automations: ["package_purchased", "package_credit_expiring"],
  },
  {
    key: "days_until_expiry_label",
    description: "Human label for time until credits expire",
    example: "1 week",
    automations: ["package_credit_expiring"],
  },
  {
    key: "ticket_subject",
    description: "Help ticket subject line",
    example: "Billing question",
    automations: ["help_ticket_reply"],
  },
  {
    key: "reply_body",
    description: "Admin’s help ticket reply text",
    example: "Thanks for reaching out…",
    automations: ["help_ticket_reply"],
  },
  {
    key: "from_label",
    description: "Support signature label",
    example: "Convene Support",
    automations: ["help_ticket_reply"],
  },
  {
    key: "thread_url",
    description: "Dashboard inbox (continue help ticket conversation)",
    example: "https://convene.io/dashboard?view=inbox",
    automations: ["help_ticket_reply"],
  },
];

/** Variables available for a given automation_key (includes "*" globals). */
export function variablesForAutomation(automationKey: string): TemplateVariableEntry[] {
  return TEMPLATE_VARIABLE_REFERENCE.filter(
    (v) => v.automations.includes("*") || v.automations.includes(automationKey),
  );
}

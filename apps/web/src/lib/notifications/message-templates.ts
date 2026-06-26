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
  email_cta_url: string;
  email_cta_label: string;
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
    notes:
      "The DM itself always appears in inbox from the sender. In-app template fields are not used for this automation (would duplicate the real message).",
  },
  {
    automation_key: "booking_confirmed",
    automation_label: "Booking confirmed",
    when_it_sends:
      "Automatically when session payment succeeds — sent to the learner who made the booking (Stripe webhook / payment finalize).",
    wired_channels: ["email", "sms", "in_app"],
  },
  {
    automation_key: "new_booking",
    automation_label: "New booking",
    when_it_sends:
      "Automatically when session payment succeeds — sent to the expert who was booked (Stripe webhook / payment finalize).",
    wired_channels: ["email", "sms", "in_app"],
  },
  {
    automation_key: "package_purchased",
    automation_label: "Package purchased",
    when_it_sends:
      "Automatically when a learner completes package checkout (Stripe webhook) — confirms credits granted and expiration.",
    wired_channels: ["email", "in_app"],
  },
  {
    automation_key: "package_credit_expiring",
    automation_label: "Package credits expiring soon",
    when_it_sends:
      "Automatically at ~1 month, ~2 weeks, ~1 week, and ~3 days before unused credits expire (cron: check-package-credit-expiration-reminders, daily).",
    wired_channels: ["email", "sms", "in_app"],
  },
  {
    automation_key: "booking_reminder",
    automation_label: "Upcoming session reminder",
    when_it_sends: "Automatically ~15 minutes before session start (cron: check-booking-reminders, every 2 min).",
    wired_channels: ["email", "sms", "in_app"],
  },
  {
    automation_key: "booking_request_approved",
    automation_label: "Booking request approved",
    when_it_sends:
      "Automatically when an expert approves a learner's booking request (auto-book off) — sent to the learner with a link to complete payment.",
    wired_channels: ["email", "in_app"],
  },
  {
    automation_key: "booking_request_declined",
    automation_label: "Booking request declined",
    when_it_sends:
      "Automatically when an expert declines a learner's booking request — sent to the learner (includes similar expert suggestions).",
    wired_channels: ["email", "in_app"],
  },
  {
    automation_key: "booking_reschedule_accepted_learner",
    automation_label: "Reschedule accepted (learner)",
    when_it_sends:
      "Automatically when a reschedule proposal is accepted — sent to the learner with the updated session time.",
    wired_channels: ["email", "in_app"],
  },
  {
    automation_key: "booking_reschedule_accepted_expert",
    automation_label: "Reschedule accepted (expert)",
    when_it_sends:
      "Automatically when a reschedule proposal is accepted — sent to the expert with the updated session time.",
    wired_channels: ["email", "in_app"],
  },
  {
    automation_key: "booking_canceled_by_expert",
    automation_label: "Booking canceled by expert",
    when_it_sends:
      "Automatically when an expert cancels a booking — sent to the learner (includes similar expert suggestions).",
    wired_channels: ["email", "sms", "in_app"],
  },
  {
    automation_key: "booking_canceled_by_learner",
    automation_label: "Booking canceled by learner",
    when_it_sends: "Automatically when a learner cancels a booking — sent to the expert.",
    wired_channels: ["email", "sms", "in_app"],
  },
  {
    automation_key: "booking_canceled",
    automation_label: "Booking canceled (legacy)",
    when_it_sends:
      "Fallback only when cancelled_by is missing on the booking row. Prefer booking_canceled_by_expert / booking_canceled_by_learner.",
    wired_channels: ["email", "sms", "in_app"],
  },
  {
    automation_key: "refund_issued",
    automation_label: "Refund issued",
    when_it_sends: "Automatically when an admin issues a Stripe refund from Booking Problems (user complaints and other cases).",
    wired_channels: ["email", "in_app"],
    notes: "Expert no-show refunds use the dedicated expert_no_show_refund template instead.",
  },
  {
    automation_key: "expert_no_show_refund",
    automation_label: "Expert no-show refund",
    when_it_sends:
      "Automatically when an admin clicks Issue refund on Booking Problems → Expert No Show. Sends email + in-app DM (admin can override the DM text).",
    wired_channels: ["email", "in_app"],
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
    wired_channels: ["in_app", "email"],
  },
  {
    automation_key: "help_ticket_reply",
    automation_label: "Help ticket admin reply",
    when_it_sends:
      "When an admin replies to a help ticket (Admin → Help Tickets). Email + dashboard inbox for signed-in users.",
    wired_channels: ["email", "in_app"],
  },
];

const SELECT_COLS =
  "template_id, automation_key, automation_label, automation_description, " +
  "in_app_enabled, in_app_subject, in_app_body, " +
  "email_enabled, email_subject, email_body, email_cta_url, email_cta_label, " +
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
    email_cta_url: "{{inbox_url}}",
    email_cta_label: "Open inbox",
    sms_enabled: false,
    sms_body: "{{sender_name}}: {{message_preview}}",
    display_order: 10,
  },
  booking_confirmed: {
    automation_key: "booking_confirmed",
    automation_label: "Booking confirmed",
    automation_description:
      "Automatically when session payment succeeds — sent to the learner who made the booking.",
    in_app_enabled: true,
    in_app_subject: "Session confirmed with {{expert_name}}",
    in_app_body:
      "Your session with {{expert_name}} is confirmed for {{session_date}} at {{session_time}}.",
    email_enabled: true,
    email_subject: "Session confirmed: {{session_date}} at {{session_time}}",
    email_body:
      "Hi {{recipient_name}},\n\nYour Convene session is confirmed.\n\nExpert: {{expert_name}}\nWhen: {{session_date}} at {{session_time}} ({{time_zone}})\nJoin link: {{session_link}}\n\nAdd to calendar: {{calendar_link}}\n\nSee you then!",
    email_cta_url: "{{session_link}}",
    email_cta_label: "Join session",
    sms_enabled: false,
    sms_body:
      "Convene: session with {{expert_name}} confirmed for {{session_date}} {{session_time}}.",
    display_order: 20,
  },
  new_booking: {
    automation_key: "new_booking",
    automation_label: "New booking",
    automation_description:
      "Automatically when session payment succeeds — sent to the expert who was booked.",
    in_app_enabled: true,
    in_app_subject: "New booking from {{learner_name}}",
    in_app_body:
      "{{learner_name}} booked a session with you for {{session_date}} at {{session_time}}.",
    email_enabled: true,
    email_subject: "New booking: {{session_date}} at {{session_time}}",
    email_body:
      "Hi {{recipient_name}},\n\n{{learner_name}} booked a session with you.\n\nWhen: {{session_date}} at {{session_time}} ({{time_zone}})\nJoin link: {{session_link}}\n\nAdd to calendar: {{calendar_link}}\n\nSee you then!",
    email_cta_url: "{{bookings_url}}",
    email_cta_label: "View booked sessions",
    sms_enabled: false,
    sms_body:
      "Convene: new booking from {{learner_name}} on {{session_date}} {{session_time}}.",
    display_order: 21,
  },
  package_purchased: {
    automation_key: "package_purchased",
    automation_label: "Package purchased",
    automation_description:
      "Automatically when a learner completes package checkout (Stripe webhook) — confirms credits granted and expiration.",
    in_app_enabled: true,
    in_app_subject: "Package confirmed: {{package_title}}",
    in_app_body:
      "You purchased {{credit_count}} sessions with {{expert_name}} ({{package_title}}). Credits expire {{expiration_date}}. Book a session: {{book_url}}",
    email_enabled: true,
    email_subject: "Package purchase confirmed: {{package_title}}",
    email_body:
      "Hi {{recipient_name}},\n\nYour Convene package purchase is confirmed.\n\nExpert: {{expert_name}}\nPackage: {{package_title}}\nSessions: {{credit_count}}\nExpires: {{expiration_date}}\n\nBook a session: {{book_url}}\nView credits: {{account_url}}",
    email_cta_url: "{{book_url}}",
    email_cta_label: "Book a session",
    sms_enabled: false,
    sms_body:
      "Convene: {{credit_count}} sessions with {{expert_name}} — expires {{expiration_date}}.",
    display_order: 22,
  },
  package_credit_expiring: {
    automation_key: "package_credit_expiring",
    automation_label: "Package credits expiring soon",
    automation_description:
      "Automatically at ~1 month, ~2 weeks, ~1 week, and ~3 days before unused credits expire (cron: check-package-credit-expiration-reminders, daily).",
    in_app_enabled: true,
    in_app_subject: "Credits expiring in {{days_until_expiry_label}}",
    in_app_body:
      "You have {{remaining_credits}} unused session(s) with {{expert_name}} ({{package_title}}) expiring on {{expiration_date}}. Book now: {{book_url}}",
    email_enabled: true,
    email_subject: "Reminder: package credits expiring in {{days_until_expiry_label}}",
    email_body:
      "Hi {{recipient_name}},\n\nYou have {{remaining_credits}} unused session(s) with {{expert_name}} for {{package_title}}.\n\nThey expire on {{expiration_date}} ({{days_until_expiry_label}} from now).\n\nBook a session: {{book_url}}\nView credits: {{account_url}}",
    email_cta_url: "{{book_url}}",
    email_cta_label: "Book a session",
    sms_enabled: true,
    sms_body:
      "Convene: {{remaining_credits}} session(s) with {{expert_name}} expire {{expiration_date}}. {{book_url}}",
    display_order: 25,
  },
  booking_reminder: {
    automation_key: "booking_reminder",
    automation_label: "Upcoming session reminder",
    automation_description: AUTOMATION_CATALOG[5].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "Reminder: session on {{session_date}}",
    in_app_body:
      "Your Convene session with {{other_party_name}} starts at {{session_time}}. Join: {{session_link}}",
    email_enabled: true,
    email_subject: "Reminder: session on {{session_date}}",
    email_body:
      "Hi {{recipient_name}},\n\nYour Convene session is coming up.\n\nWith: {{other_party_name}}\nWhen: {{session_date}} at {{session_time}}\nJoin: {{session_link}}",
    email_cta_url: "{{session_link}}",
    email_cta_label: "Join session",
    sms_enabled: true,
    sms_body: "Convene: session {{session_date}} {{session_time}}. {{session_link}}",
    display_order: 30,
  },
  booking_request_approved: {
    automation_key: "booking_request_approved",
    automation_label: "Booking request approved",
    automation_description: AUTOMATION_CATALOG[6].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "{{expert_name}} approved your booking request",
    in_app_body:
      "{{expert_name}} approved your session on {{session_date}} at {{session_time}}.\n\n{{expert_message}}\n\nWe couldn't charge your saved card — complete payment to confirm: {{bookings_url}}",
    email_enabled: true,
    email_subject: "Booking approved — complete payment for {{session_date}}",
    email_body:
      "Hi {{recipient_name}},\n\nGood news — [{{expert_name}}]({{expert_profile_url}}) approved your Convene session request for {{session_date}} at {{session_time}}.\n\nMessage from {{expert_name}}:\n{{expert_message}}\n\nWe couldn't charge your saved card automatically. Complete payment to confirm: {{bookings_url}}",
    email_cta_url: "{{bookings_url}}",
    email_cta_label: "Complete payment",
    sms_enabled: false,
    sms_body: "",
    display_order: 35,
  },
  booking_request_declined: {
    automation_key: "booking_request_declined",
    automation_label: "Booking request declined",
    automation_description: AUTOMATION_CATALOG[7].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "{{expert_name}} declined your booking request",
    in_app_body:
      "{{expert_name}} declined your session request for {{session_date}} at {{session_time}}.\n\n{{expert_message}}\n\n{{refund_status}}",
    email_enabled: true,
    email_subject: "Booking request declined: {{session_date}}",
    email_body:
      "Hi {{recipient_name}},\n\n[{{expert_name}}]({{expert_profile_url}}) declined your Convene session request for {{session_date}} at {{session_time}}.\n\nMessage from {{expert_name}}:\n{{expert_message}}\n\n{{refund_status}}\n\n{{similar_experts_section}}",
    email_cta_url: "{{browse_url}}",
    email_cta_label: "Browse experts",
    sms_enabled: false,
    sms_body: "",
    display_order: 36,
  },
  booking_reschedule_accepted_learner: {
    automation_key: "booking_reschedule_accepted_learner",
    automation_label: "Reschedule accepted (learner)",
    automation_description:
      "Automatically when a reschedule proposal is accepted — sent to the learner with the updated session time.",
    in_app_enabled: true,
    in_app_subject: "Session rescheduled with {{expert_name}}",
    in_app_body:
      "Your session with {{expert_name}} has been rescheduled to {{session_date}} at {{session_time}}.",
    email_enabled: true,
    email_subject: "Session rescheduled: {{session_date}} at {{session_time}}",
    email_body:
      "Hi {{recipient_name}},\n\nYour Convene session has been rescheduled.\n\nExpert: {{expert_name}}\nNew time: {{session_date}} at {{session_time}} ({{time_zone}})\nJoin link: {{session_link}}\n\nAdd to calendar: {{calendar_link}}\n\nSee you then!",
    email_cta_url: "{{session_link}}",
    email_cta_label: "Join session",
    sms_enabled: false,
    sms_body:
      "Convene: session with {{expert_name}} rescheduled to {{session_date}} {{session_time}}.",
    display_order: 37,
  },
  booking_reschedule_accepted_expert: {
    automation_key: "booking_reschedule_accepted_expert",
    automation_label: "Reschedule accepted (expert)",
    automation_description:
      "Automatically when a reschedule proposal is accepted — sent to the expert with the updated session time.",
    in_app_enabled: true,
    in_app_subject: "Session rescheduled with {{learner_name}}",
    in_app_body:
      "{{learner_name}} accepted your reschedule proposal. The session is now {{session_date}} at {{session_time}}.",
    email_enabled: true,
    email_subject: "Session rescheduled: {{session_date}} at {{session_time}}",
    email_body:
      "Hi {{recipient_name}},\n\nA reschedule proposal was accepted for your Convene session.\n\nLearner: {{learner_name}}\nNew time: {{session_date}} at {{session_time}} ({{time_zone}})\nJoin link: {{session_link}}\n\nAdd to calendar: {{calendar_link}}\n\nSee you then!",
    email_cta_url: "{{bookings_url}}",
    email_cta_label: "View booked sessions",
    sms_enabled: false,
    sms_body:
      "Convene: session with {{learner_name}} rescheduled to {{session_date}} {{session_time}}.",
    display_order: 38,
  },
  booking_canceled_by_expert: {
    automation_key: "booking_canceled_by_expert",
    automation_label: "Booking canceled by expert",
    automation_description:
      "Automatically when an expert cancels a booking — sent to the learner who was booked.",
    in_app_enabled: true,
    in_app_subject: "Session canceled by {{expert_name}}",
    in_app_body:
      "{{expert_name}} canceled your session on {{session_date}} at {{session_time}}. {{refund_status}}",
    email_enabled: true,
    email_subject: "Session canceled: {{session_date}}",
    email_body:
      "Hi {{recipient_name}},\n\nWe're sorry — [{{expert_name}}]({{expert_profile_url}}) had to cancel your Convene session on {{session_date}} at {{session_time}}.\n\n{{refund_status}}\n\n{{similar_experts_section}}",
    email_cta_url: "{{browse_url}}",
    email_cta_label: "Browse experts",
    sms_enabled: false,
    sms_body: "Convene: {{expert_name}} canceled your session {{session_date}}. {{refund_status}}",
    display_order: 40,
  },
  booking_canceled_by_learner: {
    automation_key: "booking_canceled_by_learner",
    automation_label: "Booking canceled by learner",
    automation_description:
      "Automatically when a learner cancels a booking — sent to the expert who was booked.",
    in_app_enabled: true,
    in_app_subject: "Session canceled by {{learner_name}}",
    in_app_body:
      "{{learner_name}} canceled your session on {{session_date}} at {{session_time}}. {{refund_status}}",
    email_enabled: true,
    email_subject: "Session canceled: {{session_date}}",
    email_body:
      "Hi {{recipient_name}},\n\n{{learner_name}} canceled your Convene session on {{session_date}} at {{session_time}}.\n\n{{refund_status}}\n\nView your booked sessions: {{bookings_url}}",
    email_cta_url: "{{bookings_url}}",
    email_cta_label: "View booked sessions",
    sms_enabled: false,
    sms_body: "Convene: {{learner_name}} canceled your session {{session_date}}. {{refund_status}}",
    display_order: 41,
  },
  booking_canceled: {
    automation_key: "booking_canceled",
    automation_label: "Booking canceled (legacy)",
    automation_description:
      "Fallback when cancelled_by is missing. Normally use booking_canceled_by_expert or booking_canceled_by_learner.",
    in_app_enabled: true,
    in_app_subject: "Session canceled",
    in_app_body:
      "Your session with {{other_party_name}} on {{session_date}} has been canceled. {{refund_status}}",
    email_enabled: true,
    email_subject: "Session canceled: {{session_date}}",
    email_body:
      "Hi {{recipient_name}},\n\nYour Convene session with {{other_party_name}} on {{session_date}} has been canceled.\n\n{{refund_status}}\n\nIf this was a mistake, you can rebook from their profile.",
    email_cta_url: "",
    email_cta_label: "",
    sms_enabled: false,
    sms_body: "Convene: session {{session_date}} canceled. {{refund_status}}",
    display_order: 42,
  },
  refund_issued: {
    automation_key: "refund_issued",
    automation_label: "Refund issued",
    automation_description: AUTOMATION_CATALOG[10].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "Refund issued",
    in_app_body:
      "We issued a {{refund_amount}} refund for your session on {{session_date}}. It should post to your card within 5–10 business days.",
    email_enabled: true,
    email_subject: "Refund issued for {{session_date}}",
    email_body:
      "Hi {{recipient_name}},\n\nWe issued a {{refund_amount}} refund for your Convene session on {{session_date}}.\n\nIt should post to your original payment method within 5–10 business days.\n\nIf you have questions, reply to this email.",
    email_cta_url: "",
    email_cta_label: "",
    sms_enabled: false,
    sms_body: "Convene: {{refund_amount}} refund issued for {{session_date}}.",
    display_order: 50,
  },
  expert_no_show_refund: {
    automation_key: "expert_no_show_refund",
    automation_label: "Expert no-show refund",
    automation_description: AUTOMATION_CATALOG[11].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "Refund issued for your session",
    in_app_body:
      "We're sorry {{expert_name}} wasn't able to join your session on {{session_date}} at {{session_time}}.\n\nWe issued a {{refund_amount}} refund to your original payment method. It should post within 5–10 business days.\n\nThank you for your patience — we hope to see you back on Convene soon.",
    email_enabled: true,
    email_subject: "Refund issued: expert no-show on {{session_date}}",
    email_body:
      "Hi {{recipient_name}},\n\nWe're sorry {{expert_name}} wasn't able to join your scheduled Convene session on {{session_date}} at {{session_time}}.\n\nWe issued a {{refund_amount}} refund to your original payment method. It should post within 5–10 business days.\n\nIf you have any questions, reply to this email or message us from your dashboard inbox.",
    email_cta_url: "{{dashboard_url}}",
    email_cta_label: "Open dashboard",
    sms_enabled: false,
    sms_body: "",
    display_order: 45,
  },
  expert_approved: {
    automation_key: "expert_approved",
    automation_label: "Expert registration approved",
    automation_description: AUTOMATION_CATALOG[12].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "You're approved on Convene",
    in_app_body:
      "Welcome to Convene! Your expert profile is live. Visit your dashboard to publish availability and start receiving bookings.",
    email_enabled: true,
    email_subject: "You're approved on Convene",
    email_body:
      "Hi {{recipient_name}},\n\nGreat news — your Convene expert profile has been approved and is now live on the platform.\n\nNext steps:\n• Publish your weekly availability.\n• Set your session pricing.\n• Share your profile link: {{profile_url}}\n\nWelcome aboard!",
    email_cta_url: "{{profile_url}}",
    email_cta_label: "Open dashboard",
    sms_enabled: false,
    sms_body: "",
    display_order: 60,
  },
  welcome_learner: {
    automation_key: "welcome_learner",
    automation_label: "Welcome (new learner)",
    automation_description: AUTOMATION_CATALOG[13].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "Welcome to Convene",
    in_app_body:
      "Welcome to convene! 🎉\n\nWe're thrilled you've joined our community.\n\n Here are some tips to get started:\n\n• Browse experts in your area of interest\n• Message experts to find a good fit\n• Post requests and have experts come to you\n• Join our community message boards to engage with other users\n\nHappy learning!",
    email_enabled: true,
    email_subject: "Welcome to Convene",
    email_body:
      "Hi {{recipient_name}},\n\nWelcome to Convene — glad to have you.\n\nHere are three ways to get rolling:\n• [Browse experts]({{browse_url}})\n• [Post a request]({{post_request_url}})\n• [Complete your profile]({{profile_url}})\n\nReply to this email anytime if you need a hand.",
    email_cta_url: "{{browse_url}}",
    email_cta_label: "Browse experts",
    sms_enabled: false,
    sms_body: "",
    display_order: 70,
  },
  expert_registration_welcome: {
    automation_key: "expert_registration_welcome",
    automation_label: "Expert registration submitted",
    automation_description: AUTOMATION_CATALOG[14].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "Thanks for registering as an expert",
    in_app_body:
      "Thank you for sharing your expertise! We're excited for you to engage with our community of learners.\n\nHere are some tips to get started:\n\n• Browse our community message boards to interact with learners\n• Send custom offers to book your first sessions\n• Share the url to your Expert Profile ({{profile_url}}) on your personal and social networks\n• Check out our Expert coaching resources for tips on maximizing your bookings\n\nHappy coaching!",
    email_enabled: true,
    email_subject: "Thanks for registering as an expert on Convene",
    email_body:
      "Hi {{recipient_name}},\n\nThank you for sharing your expertise! We're excited for you to engage with our community of learners.\n\nHere are some tips to get started:\n\n• Browse our community message boards to interact with learners\n• Send custom offers to book your first sessions\n• Share your [Expert Profile]({{profile_url}}) on your personal and social networks\n• Check out our Expert coaching resources for tips on maximizing your bookings\n\nWe'll review your application and email you when you're approved.\n\nHappy coaching!",
    email_cta_url: "{{profile_url}}",
    email_cta_label: "View your profile",
    sms_enabled: false,
    sms_body: "",
    display_order: 75,
  },
  help_ticket_reply: {
    automation_key: "help_ticket_reply",
    automation_label: "Help ticket admin reply",
    automation_description: AUTOMATION_CATALOG[15].when_it_sends,
    in_app_enabled: true,
    in_app_subject: "Re: {{ticket_subject}}",
    in_app_body: "{{reply_body}}\n\n—\n{{from_label}}",
    email_enabled: true,
    email_subject: "Re: {{ticket_subject}}",
    email_body:
      "Hi {{recipient_name}},\n\n{{reply_body}}\n\n—\n{{from_label}}\n\nReply in Convene to keep this conversation in one place:\n{{thread_url}}\n\n(Replies to this email are not monitored — please use the link above.)",
    email_cta_url: "{{thread_url}}",
    email_cta_label: "Reply in Convene",
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

  return normalizeTemplateRow(data as Record<string, unknown>);
}

function normalizeTemplateRow(data: Record<string, unknown>): MessageTemplateRow {
  return {
    ...(data as unknown as MessageTemplateRow),
    email_cta_url: String(data.email_cta_url ?? ""),
    email_cta_label: String(data.email_cta_label ?? ""),
  };
}

export function resolveEmailFromTemplate(
  row: MessageTemplateRow | null,
  vars: Record<string, string>,
  fallback: { subject: string; body: string; ctaUrl?: string; ctaLabel?: string },
): {
  enabled: boolean;
  subject: string;
  body: string;
  ctaUrl: string | null;
  ctaLabel: string | null;
} {
  if (!row || !row.email_enabled) {
    return {
      enabled: false,
      subject: fallback.subject,
      body: fallback.body,
      ctaUrl: fallback.ctaUrl ?? null,
      ctaLabel: fallback.ctaLabel ?? null,
    };
  }

  const ctaUrlRaw = (row.email_cta_url || fallback.ctaUrl || "").trim();
  const ctaLabelRaw = (row.email_cta_label || fallback.ctaLabel || "").trim();
  const ctaUrl = ctaUrlRaw ? renderMessageTemplate(ctaUrlRaw, vars).trim() : "";
  const ctaLabel = ctaLabelRaw ? renderMessageTemplate(ctaLabelRaw, vars).trim() : "";

  return {
    enabled: true,
    subject: renderMessageTemplate(row.email_subject || fallback.subject, vars),
    body: renderMessageTemplate(row.email_body || fallback.body, vars),
    ctaUrl: ctaUrl && ctaLabel ? ctaUrl : null,
    ctaLabel: ctaUrl && ctaLabel ? ctaLabel : null,
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

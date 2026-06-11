/**
 * Expert dashboard tour (Bible spec): 9 steps, Hero Orange highlight + popup + 50% dim.
 */
export type ExpertBibleTourStep = {
  title: string;
  body: string;
  /** data-tour-target id, or null for center-only step */
  target: string | null;
  /** Step 9: full-screen dim, centered dialog */
  centerOnly?: boolean;
};

export const EXPERT_BIBLE_TOUR_STEPS: ExpertBibleTourStep[] = [
  {
    title: "Booked Sessions",
    body: "You'll find all of your upcoming bookings and previous session information here.",
    target: "sidebar-booked-sessions",
  },
  {
    title: "Join Session",
    body: "You can join your session by clicking this button within 10 minutes of the start time.",
    target: "tour-join-session",
  },
  {
    title: "Manage Booking",
    body: "You can manage a booking here, including cancelling, rescheduling, and sending special offers to learners.",
    target: "tour-manage-booking",
  },
  {
    title: "Inbox",
    body: "You can interact with learners here. In addition to messaging, you can send special offers—including freelance or prep/review time, multi-session packages—and suggest session times.",
    target: "sidebar-inbox",
  },
  {
    title: "Send an Offer",
    body: "From your inbox, you can send Learners special offers for bookings. That includes suggesting a time, plus customized discounts, multi-session packages, and billable time for Session Prep or Review and freelance work.",
    target: "tour-inbox-suggest",
  },
  {
    title: "Community Requests",
    body: "See a personalized selection of user requests here that we think you're qualified to address, or peruse the entire message board. Respond to requests, send offers, and engage with the community — this is a great way to promote new bookings.",
    target: "sidebar-community-requests",
  },
  {
    title: "Manage your Availability",
    body: "Update your recurring availability windows here at any time. You can also Add, delete, and manage availability on specific dates and times on the monthly calendar.",
    target: "sidebar-availability",
  },
  {
    title: "Manage and Track",
    body: "Update your preferences and track your progress here at any time.",
    target: "expert-sidebar-footer-links",
  },
  {
    title: "Thank you for sharing your expertise on convene.",
    body: "Start perusing our message boards and engaging with the community to get your first booking.",
    target: null,
    centerOnly: true,
  },
];

/** Dashboard ?view= for each step (0-based index). */
export const EXPERT_BIBLE_TOUR_VIEWS: string[] = [
  "sessions",
  "sessions",
  "sessions",
  "inbox",
  "inbox",
  "community-requests",
  "availability",
  "overview",
  "overview",
];

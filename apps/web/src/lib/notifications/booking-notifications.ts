import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildBookingScheduleVars,
  formatSessionDate,
  formatSessionTime,
  formatTotalPaid,
  type BookingScheduleFields,
} from "@/lib/notifications/booking-template-vars";
import {
  fetchMessageTemplate,
  resolveEmailFromTemplate,
  resolveInAppFromTemplate,
  resolveSmsFromTemplate,
  renderMessageTemplate,
  TEMPLATE_FALLBACKS,
} from "@/lib/notifications/message-templates";
import { dispatchInAppTemplateMessage } from "@/lib/notifications/dispatch-in-app-template";
import {
  buildBookingIcs,
  bookingCalendarUrl,
} from "@/lib/notifications/booking-ics";
import {
  fetchSimilarExpertsForEmail,
  formatSimilarExpertsList,
  formatSimilarExpertsSection,
} from "@/lib/notifications/similar-experts-for-email";
import {
  isSendGridConfigured,
  sendResolvedTemplateEmail,
  sendSmsTwilio,
  isE164Phone,
} from "@/lib/notifications/send-channels";

function appBaseUrl(): string {
  return (
    (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")) ||
    "http://localhost:3000"
  );
}

function displayName(row: {
  first_name: string | null;
  last_name: string | null;
  email_address: string | null;
}) {
  const n = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return n || row.email_address || "User";
}

type PartyRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email_address: string | null;
  phone_number: string | null;
  time_zone?: string | null;
};

type BookingNotificationRow = {
  booking_id: string;
  session_date: string;
  start_time: string;
  end_time?: string | null;
  duration?: string | null;
  total_amount?: number | string | null;
  booking_amount?: number | string | null;
  expert_user_id: string;
  learner_user_id: string;
};

async function resolvePartyEmail(
  admin: ReturnType<typeof createAdminClient>,
  party: PartyRow | undefined,
): Promise<PartyRow | undefined> {
  if (!party) return undefined;
  if (party.email_address?.trim()) return party;
  try {
    const { data, error } = await admin.auth.admin.getUserById(party.user_id);
    const authEmail = data?.user?.email?.trim();
    if (!error && authEmail) {
      return { ...party, email_address: authEmail };
    }
  } catch (e) {
    console.warn("[notifications] could not resolve auth email for user", party.user_id, e);
  }
  return party;
}

async function fetchBookingParties(booking: {
  expert_user_id: string;
  learner_user_id: string;
}) {
  const admin = createAdminClient();
  const { data: users } = await admin
    .from("users")
    .select("user_id, first_name, last_name, email_address, phone_number, time_zone")
    .in("user_id", [booking.expert_user_id, booking.learner_user_id]);

  const expertRaw = users?.find((u) => u.user_id === booking.expert_user_id) as PartyRow | undefined;
  const learnerRaw = users?.find((u) => u.user_id === booking.learner_user_id) as PartyRow | undefined;
  const [expert, learner] = await Promise.all([
    resolvePartyEmail(admin, expertRaw),
    resolvePartyEmail(admin, learnerRaw),
  ]);
  return { admin, expert, learner };
}

const CALENDAR_EMAIL_AUTOMATIONS = new Set([
  "booking_confirmed",
  "new_booking",
  "booking_reschedule_accepted_learner",
  "booking_reschedule_accepted_expert",
]);

type NotifyPartyResult = {
  /** Email channel enabled in template and recipient has an address. */
  emailRequired: boolean;
  emailSent: boolean;
};

async function notifyParty(
  admin: ReturnType<typeof createAdminClient>,
  automationKey: string,
  recipient: PartyRow,
  vars: Record<string, string>,
  calendar?: { booking: BookingNotificationRow; expert: PartyRow; learner: PartyRow },
): Promise<NotifyPartyResult> {
  const template = await fetchMessageTemplate(admin, automationKey);
  const fb = TEMPLATE_FALLBACKS[automationKey];
  if (!fb) return { emailRequired: false, emailSent: true };

  const email = resolveEmailFromTemplate(template, vars, {
    subject: fb.email_subject,
    body: fb.email_body,
    ctaUrl: fb.email_cta_url,
    ctaLabel: fb.email_cta_label,
  });

  let calendarIcs: string | null = null;
  let calendarFollowUpSubject: string | null = null;
  let calendarFollowUpBody: string | null = null;
  if (calendar && CALENDAR_EMAIL_AUTOMATIONS.has(automationKey)) {
    const base = appBaseUrl();
    const sessionLink = `${base}/session/${calendar.booking.booking_id}`;
    const dashboardLink = `${base}/dashboard?view=sessions`;
    const expertName = displayName(calendar.expert);
    const learnerName = displayName(calendar.learner);
    const other =
      recipient.user_id === calendar.expert.user_id ? calendar.learner : calendar.expert;
    const summary = `Convene session with ${displayName(other)}`;
    calendarIcs =
      buildBookingIcs({
        bookingId: calendar.booking.booking_id,
        sessionDate: calendar.booking.session_date,
        startTime: calendar.booking.start_time,
        endTime: calendar.booking.end_time,
        duration: calendar.booking.duration,
        timeZone: calendar.expert.time_zone ?? "UTC",
        summary,
        expertName,
        learnerName,
        sessionLink,
        dashboardLink,
        appHost: new URL(base).hostname,
      }) ?? null;
    if (calendarIcs) {
      calendarFollowUpSubject = `Add to calendar: ${vars.session_date} at ${vars.session_time}`;
      calendarFollowUpBody = [
        "Your Convene session is attached — open the calendar file to add it to your calendar app.",
        "",
        `Session: ${vars.session_date} at ${vars.session_time}`,
        `Join: ${sessionLink}`,
      ].join("\n");
    }
  }

  let emailRequired = false;
  let emailSent = true;
  if (email.enabled && recipient.email_address) {
    emailRequired = true;
    emailSent = await sendResolvedTemplateEmail(recipient.email_address, {
      ...email,
      calendarIcs,
      calendarFollowUpSubject,
      calendarFollowUpBody,
    });
    if (!emailSent) {
      console.error(
        "[notifications] email send failed",
        automationKey,
        recipient.user_id,
        recipient.email_address,
      );
    }
  } else if (email.enabled) {
    emailRequired = true;
    emailSent = false;
    console.warn(
      "[notifications] email skipped — no address",
      automationKey,
      recipient.user_id,
    );
  }

  const sms = resolveSmsFromTemplate(template, vars, fb.sms_body);
  if (sms.enabled && isE164Phone(recipient.phone_number)) {
    await sendSmsTwilio(recipient.phone_number, sms.body);
  }

  await dispatchInAppTemplateMessage(admin, automationKey, recipient.user_id, vars, {
    booking_id: calendar?.booking.booking_id,
  });

  return { emailRequired, emailSent };
}

function partyVars(
  booking: BookingNotificationRow,
  expert: PartyRow,
  learner: PartyRow,
  recipient: PartyRow,
  extraVars: Record<string, string> = {},
): Record<string, string> {
  const other = recipient.user_id === expert.user_id ? learner : expert;
  const expertName = displayName(expert);
  const learnerName = displayName(learner);
  const base = appBaseUrl();

  return {
    ...buildBookingScheduleVars(booking, base),
    recipient_name: displayName(recipient),
    other_party_name: displayName(other),
    expert_name: expertName,
    learner_name: learnerName,
    session_link: `${base}/session/${booking.booking_id}`,
    calendar_link: bookingCalendarUrl(booking.booking_id, base),
    expert_profile_url: `${base}/experts/${expert.user_id}`,
    browse_url: `${base}/search`,
    time_zone: (recipient.time_zone ?? other.time_zone ?? "UTC").trim() || "UTC",
    ...extraVars,
  };
}

async function notifyBookingParties(
  automationKey: "booking_canceled",
  booking: BookingNotificationRow,
  extraVars: Record<string, string> = {},
) {
  const { admin, expert, learner } = await fetchBookingParties(booking);
  if (!expert || !learner) return;

  for (const recipient of [expert, learner]) {
    await notifyParty(
      admin,
      automationKey,
      recipient,
      partyVars(booking, expert, learner, recipient, extraVars),
    );
  }
}

export async function dispatchBookingCanceled(bookingId: string, refundStatus = "") {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(
      "booking_id, session_date, start_time, end_time, duration, booking_amount, total_amount, expert_user_id, learner_user_id, cancelled_by",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!booking) return;

  const { expert, learner } = await fetchBookingParties(booking);
  if (!expert || !learner) return;

  const row = booking as BookingNotificationRow;
  const base = appBaseUrl();
  const extraVars = {
    refund_status: refundStatus || "No refund was issued for this cancellation.",
  };
  const cancelledBy = booking.cancelled_by ? String(booking.cancelled_by) : null;

  if (cancelledBy === booking.expert_user_id) {
    const similarExperts = await fetchSimilarExpertsForEmail(
      admin,
      booking.expert_user_id,
      base,
      3,
    );
    await notifyParty(
      admin,
      "booking_canceled_by_expert",
      learner,
      {
        ...partyVars(row, expert, learner, learner, extraVars),
        similar_experts_list: formatSimilarExpertsList(similarExperts),
        similar_experts_section: formatSimilarExpertsSection(similarExperts),
      },
    );
    return;
  }

  if (cancelledBy === booking.learner_user_id) {
    await notifyParty(
      admin,
      "booking_canceled_by_learner",
      expert,
      partyVars(row, expert, learner, expert, extraVars),
    );
    return;
  }

  // Legacy fallback when cancelled_by is missing (older rows / edge cases).
  await notifyBookingParties("booking_canceled", row, extraVars);
}

export async function dispatchBookingConfirmed(
  bookingId: string,
  options?: { force?: boolean },
) {
  const admin = createAdminClient();
  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select(
      "booking_id, session_date, start_time, end_time, duration, booking_amount, total_amount, expert_user_id, learner_user_id, payment_status, confirmation_notified_at",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (bookingErr) {
    const missingColumn = /confirmation_notified_at/i.test(bookingErr.message ?? "");
    if (missingColumn) {
      const { data: legacyBooking } = await admin
        .from("bookings")
        .select(
          "booking_id, session_date, start_time, end_time, duration, booking_amount, total_amount, expert_user_id, learner_user_id, payment_status",
        )
        .eq("booking_id", bookingId)
        .maybeSingle();
      if (!legacyBooking || legacyBooking.payment_status !== "paid") return;
      const emailsOk = await sendBookingConfirmationNotifications(admin, legacyBooking);
      if (!emailsOk) {
        console.error(
          "[notifications] booking confirmation emails incomplete (legacy schema)",
          bookingId,
        );
      }
      return;
    }
    console.error("[notifications] booking load failed", bookingId, bookingErr.message);
    return;
  }

  if (!booking || booking.payment_status !== "paid") return;
  if (booking.confirmation_notified_at && !options?.force) return;

  const emailsOk = await sendBookingConfirmationNotifications(admin, booking);
  if (!emailsOk) {
    console.error(
      "[notifications] booking confirmation emails incomplete; will retry",
      bookingId,
      { sendgrid_configured: isSendGridConfigured() },
    );
    return;
  }

  const now = new Date().toISOString();
  const markQuery = admin
    .from("bookings")
    .update({ confirmation_notified_at: now, updated_at: now })
    .eq("booking_id", bookingId);
  const { error: markErr } = options?.force
    ? await markQuery
    : await markQuery.is("confirmation_notified_at", null);
  if (markErr && !/confirmation_notified_at/i.test(markErr.message ?? "")) {
    console.error("[notifications] could not mark confirmation_notified_at", bookingId, markErr.message);
  }
}

async function sendBookingConfirmationNotifications(
  admin: ReturnType<typeof createAdminClient>,
  booking: {
    booking_id: string;
    session_date: string;
    start_time: string;
    end_time?: string | null;
    duration?: string | null;
    booking_amount?: number | string | null;
    total_amount?: number | string | null;
    expert_user_id: string;
    learner_user_id: string;
  },
): Promise<boolean> {
  const { expert, learner } = await fetchBookingParties(booking);
  if (!expert || !learner) {
    console.error("[notifications] booking parties missing", booking.booking_id);
    return false;
  }

  const row = booking as BookingNotificationRow;

  const learnerResult = await notifyParty(
    admin,
    "booking_confirmed",
    learner,
    partyVars(row, expert, learner, learner),
    { booking: row, expert, learner },
  );

  const expertResult = await notifyParty(
    admin,
    "new_booking",
    expert,
    partyVars(row, expert, learner, expert),
    { booking: row, expert, learner },
  );

  return (
    (!learnerResult.emailRequired || learnerResult.emailSent) &&
    (!expertResult.emailRequired || expertResult.emailSent)
  );
}

export async function dispatchRefundIssuedEmail(args: {
  recipientUserId: string;
  recipientEmail: string;
  recipientName: string;
  booking: BookingScheduleFields;
  refundAmount: string;
}) {
  const admin = createAdminClient();
  const template = await fetchMessageTemplate(admin, "refund_issued");
  const fb = TEMPLATE_FALLBACKS.refund_issued;
  const vars = {
    recipient_name: args.recipientName,
    refund_amount: args.refundAmount,
    ...buildBookingScheduleVars(args.booking, appBaseUrl()),
  };
  const email = resolveEmailFromTemplate(template, vars, {
    subject: fb.email_subject,
    body: fb.email_body,
    ctaUrl: fb.email_cta_url,
    ctaLabel: fb.email_cta_label,
  });
  if (email.enabled) {
    await sendResolvedTemplateEmail(args.recipientEmail, email);
  }

  await dispatchInAppTemplateMessage(admin, "refund_issued", args.recipientUserId, vars, {
    booking_id: args.booking.booking_id,
  });
}

export async function dispatchExpertNoShowRefund(args: {
  recipientEmail: string;
  recipientName: string;
  booking: BookingScheduleFields;
  expertName: string;
  refundAmount: string;
}): Promise<{ inAppBody: string | null; emailSent: boolean }> {
  const admin = createAdminClient();
  const template = await fetchMessageTemplate(admin, "expert_no_show_refund");
  const fb = TEMPLATE_FALLBACKS.expert_no_show_refund;
  const dashboardUrl = `${appBaseUrl()}/dashboard?view=inbox`;
  const vars = {
    recipient_name: args.recipientName,
    expert_name: args.expertName,
    refund_amount: args.refundAmount,
    ...buildBookingScheduleVars(args.booking, appBaseUrl()),
    dashboard_url: dashboardUrl,
  };

  const email = resolveEmailFromTemplate(template, vars, {
    subject: fb.email_subject,
    body: fb.email_body,
    ctaUrl: fb.email_cta_url,
    ctaLabel: fb.email_cta_label,
  });
  let emailSent = false;
  if (email.enabled) {
    emailSent = await sendResolvedTemplateEmail(args.recipientEmail, email);
  }

  const inApp = resolveInAppFromTemplate(template, vars, {
    subject: fb.in_app_subject,
    body: fb.in_app_body,
  });

  return {
    inAppBody: inApp.enabled ? inApp.body : fb.in_app_body ? renderMessageTemplate(fb.in_app_body, vars) : null,
    emailSent,
  };
}

export async function dispatchPendingBookingConfirmations(limit = 25): Promise<{
  scanned: number;
  sent: number;
  skipped: number;
}> {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("bookings")
    .select("booking_id")
    .eq("payment_status", "paid")
    .is("confirmation_notified_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    if (/confirmation_notified_at/i.test(error.message ?? "")) {
      return { scanned: 0, sent: 0, skipped: 0 };
    }
    console.error("[notifications] pending booking confirmation query failed", error.message);
    return { scanned: 0, sent: 0, skipped: 0 };
  }

  let sent = 0;
  let skipped = 0;
  for (const row of rows ?? []) {
    const bookingId = String(row.booking_id);
    const before = await admin
      .from("bookings")
      .select("confirmation_notified_at")
      .eq("booking_id", bookingId)
      .maybeSingle();
    await dispatchBookingConfirmed(bookingId);
    const after = await admin
      .from("bookings")
      .select("confirmation_notified_at")
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (!before?.confirmation_notified_at && after?.confirmation_notified_at) {
      sent += 1;
    } else {
      skipped += 1;
    }
  }

  return { scanned: rows?.length ?? 0, sent, skipped };
}

const BOOKING_REQUEST_SELECT =
  "booking_id, session_date, start_time, end_time, duration, booking_amount, total_amount, expert_user_id, learner_user_id";

async function notifyLearnerBookingRequestResponse(
  automationKey: "booking_request_approved" | "booking_request_declined",
  bookingId: string,
  extraVars: Record<string, string>,
): Promise<void> {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(BOOKING_REQUEST_SELECT)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!booking) return;

  const { expert, learner } = await fetchBookingParties(booking);
  if (!expert || !learner) return;

  const row = booking as BookingNotificationRow;
  const base = appBaseUrl();
  let vars = partyVars(row, expert, learner, learner, extraVars);

  if (automationKey === "booking_request_declined") {
    const similarExperts = await fetchSimilarExpertsForEmail(admin, booking.expert_user_id, base, 3);
    vars = {
      ...vars,
      similar_experts_list: formatSimilarExpertsList(similarExperts),
      similar_experts_section: formatSimilarExpertsSection(similarExperts),
    };
  }

  await notifyParty(admin, automationKey, learner, vars);
}

/** Reschedule proposal accepted — notify both parties with the updated session time. */
export async function dispatchBookingRescheduleAccepted(bookingId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(
      "booking_id, session_date, start_time, end_time, duration, booking_amount, total_amount, expert_user_id, learner_user_id, payment_status",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (!booking) {
    console.error("[notifications] reschedule accepted — booking not found", bookingId);
    return;
  }

  const ps = String(booking.payment_status ?? "").toLowerCase();
  if (ps !== "paid" && ps !== "succeeded") {
    console.warn("[notifications] reschedule accepted — skipping emails (not paid)", bookingId, ps);
    return;
  }

  const { expert, learner } = await fetchBookingParties(booking);
  if (!expert || !learner) {
    console.error("[notifications] reschedule accepted — parties missing", bookingId);
    return;
  }

  const row = booking as BookingNotificationRow;
  const calendarCtx = { booking: row, expert, learner };

  const learnerResult = await notifyParty(
    admin,
    "booking_reschedule_accepted_learner",
    learner,
    partyVars(row, expert, learner, learner),
    calendarCtx,
  );

  const expertResult = await notifyParty(
    admin,
    "booking_reschedule_accepted_expert",
    expert,
    partyVars(row, expert, learner, expert),
    calendarCtx,
  );

  if (
    (learnerResult.emailRequired && !learnerResult.emailSent) ||
    (expertResult.emailRequired && !expertResult.emailSent)
  ) {
    console.error("[notifications] reschedule accepted emails incomplete", bookingId, {
      sendgrid_configured: isSendGridConfigured(),
    });
  }
}

/** Expert approved a learner's booking request — learner pays to confirm. */
export async function dispatchBookingRequestApproved(
  bookingId: string,
  expertMessage: string,
): Promise<void> {
  await notifyLearnerBookingRequestResponse("booking_request_approved", bookingId, {
    expert_message: expertMessage.trim(),
  });
}

/** Expert declined a learner's booking request (no payment was taken). */
export async function dispatchBookingRequestDeclined(
  bookingId: string,
  expertMessage: string,
): Promise<void> {
  await notifyLearnerBookingRequestResponse("booking_request_declined", bookingId, {
    expert_message: expertMessage.trim(),
    refund_status: "No payment was charged for this request.",
  });
}

export async function dispatchExpertApproved(args: {
  recipientUserId: string;
  recipientEmail: string;
  recipientName: string;
}) {
  const admin = createAdminClient();
  const template = await fetchMessageTemplate(admin, "expert_approved");
  const fb = TEMPLATE_FALLBACKS.expert_approved;
  const profileUrl = `${appBaseUrl()}/experts/${args.recipientUserId}`;
  const vars = {
    recipient_name: args.recipientName,
    profile_url: profileUrl,
  };

  const email = resolveEmailFromTemplate(template, vars, {
    subject: fb.email_subject,
    body: fb.email_body,
    ctaUrl: fb.email_cta_url,
    ctaLabel: fb.email_cta_label,
  });
  if (email.enabled && args.recipientEmail) {
    await sendResolvedTemplateEmail(args.recipientEmail, email);
  }

  const inApp = resolveInAppFromTemplate(template, vars, {
    subject: fb.in_app_subject,
    body: fb.in_app_body,
  });
  if (inApp.enabled) {
    await dispatchInAppTemplateMessage(admin, "expert_approved", args.recipientUserId, vars, {
      expert_approved: true,
    });
  }
}

// Re-export for callers that build one-off template strings (e.g. admin pre-fill).
export {
  buildBookingScheduleVars,
  formatSessionDate,
  formatSessionTime,
  formatSessionDuration,
  formatTotalPaid,
  type BookingScheduleFields,
} from "@/lib/notifications/booking-template-vars";

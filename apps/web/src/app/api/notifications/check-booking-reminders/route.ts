import { timingSafeEqual } from "node:crypto";
import { publicApiError } from "@/lib/api/public-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  dispatchBookingReminder,
  type BookingReminderDispatch,
} from "@/lib/notifications/dispatch";

export const dynamic = "force-dynamic";

function cronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    try {
      const a = Buffer.from(token);
      const b = Buffer.from(secret);
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("secret");
  if (!q) return false;
  try {
    const a = Buffer.from(q);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function combineLocalDateTime(sessionDate: string, startTime: string): Date {
  return new Date(`${sessionDate}T${startTime}`);
}

export async function GET(request: Request) {
  if (!cronAuth(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const reminderTime = new Date(now.getTime() + 15 * 60 * 1000);

  const { data: bookings, error } = await admin
    .from("bookings")
    .select(
      "booking_id, session_date, start_time, status, expert_user_id, learner_user_id, reminder_15m_sent_at"
    )
    .eq("status", "upcoming")
    .is("reminder_15m_sent_at", null)
    .gte("session_date", now.toISOString().split("T")[0])
    .lte("session_date", reminderTime.toISOString().split("T")[0]);

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  const remindersSent: string[] = [];

  for (const booking of bookings ?? []) {
    const sessionDate = String(booking.session_date);
    const startTime = String(booking.start_time).slice(0, 8);
    const sessionStart = combineLocalDateTime(sessionDate, startTime);
    const timeDiff = sessionStart.getTime() - now.getTime();

    if (timeDiff < 14 * 60 * 1000 || timeDiff > 16 * 60 * 1000) {
      continue;
    }

    const sessionDateStr = sessionStart.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const sessionTimeStr = sessionStart.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    const sessionLink = `${baseUrl}/session/${booking.booking_id}`;

    const { data: expert } = await admin
      .from("users")
      .select("first_name, last_name, email_address, phone_number")
      .eq("user_id", booking.expert_user_id)
      .maybeSingle();

    const { data: learner } = await admin
      .from("users")
      .select("first_name, last_name, email_address, phone_number")
      .eq("user_id", booking.learner_user_id)
      .maybeSingle();

    const expertName = expert
      ? `${expert.first_name ?? ""} ${expert.last_name ?? ""}`.trim() ||
        expert.email_address ||
        "Expert"
      : "Expert";
    const learnerName = learner
      ? `${learner.first_name ?? ""} ${learner.last_name ?? ""}`.trim() ||
        learner.email_address ||
        "Learner"
      : "Learner";

    let notified = false;

    if (expert?.email_address) {
      const p: BookingReminderDispatch = {
        recipientEmail: expert.email_address,
        recipientPhone: expert.phone_number,
        recipientName: expertName,
        otherPartyName: learnerName,
        expertName,
        learnerName,
        sessionDate: sessionDateStr,
        sessionTime: sessionTimeStr,
        sessionLink,
      };
      await dispatchBookingReminder(p);
      notified = true;
    }

    if (learner?.email_address) {
      const p: BookingReminderDispatch = {
        recipientEmail: learner.email_address,
        recipientPhone: learner.phone_number,
        recipientName: learnerName,
        otherPartyName: expertName,
        expertName,
        learnerName,
        sessionDate: sessionDateStr,
        sessionTime: sessionTimeStr,
        sessionLink,
      };
      await dispatchBookingReminder(p);
      notified = true;
    }

    if (notified) {
      const ts = new Date().toISOString();
      await admin
        .from("bookings")
        .update({ reminder_15m_sent_at: ts, updated_at: ts })
        .eq("booking_id", booking.booking_id);
      remindersSent.push(booking.booking_id);
    }
  }

  return Response.json({
    success: true,
    remindersSent: remindersSent.length,
    bookingIds: remindersSent,
  });
}

export async function POST(request: Request) {
  return GET(request);
}

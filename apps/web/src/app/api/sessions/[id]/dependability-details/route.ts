import { createAdminClient } from "@/lib/supabase/admin";
import { computeDependabilityBreakdown } from "@/lib/dependability-breakdown";
import { displayName, getAuthedUserId, getUsersByIds } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { sessionWallClockInstant } from "@/lib/sessionWallClock";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function formatLocalDateTime(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeOnly(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatSessionDateCol(sessionDate: string | undefined): string {
  if (!sessionDate) return "—";
  const parts = sessionDate.split("-").map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return sessionDate;
  const [y, mo, da] = parts;
  const d = new Date(Date.UTC(y, mo - 1, da));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function timeStrToMinutes(t: unknown): number | null {
  const s = String(t ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  return h * 60 + mi;
}

function durationMinutesFromBooking(b: {
  duration?: unknown;
  start_time?: unknown;
  end_time?: unknown;
}): number | null {
  const dur = b.duration;
  if (dur != null) {
    const s = String(dur);
    const minMatch = s.match(/(\d+)\s*minutes?/i);
    if (minMatch) return Number(minMatch[1]);
    const iso = /^(\d+):(\d{2}):(\d{2})/.exec(s);
    if (iso) {
      const h = Number(iso[1]);
      const mi = Number(iso[2]);
      const sec = Number(iso[3]);
      if ([h, mi, sec].every((n) => Number.isFinite(n))) {
        return Math.round(h * 60 + mi + sec / 60);
      }
    }
  }
  const sm = timeStrToMinutes(b.start_time);
  const em = timeStrToMinutes(b.end_time);
  if (sm != null && em != null && em > sm) return em - sm;
  return null;
}

function formatDurationLabel(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}

function formatJoin(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(String(iso));
  if (!Number.isFinite(t)) return null;
  return formatLocalDateTime(new Date(t));
}

/** Per-booking session details + dependability for the signed-in participant. */
export async function GET(_request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: bookingId } = await params;
  const admin = createAdminClient();
  const { data: b, error } = await admin.from("bookings").select("*").eq("booking_id", bookingId).maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  if (!b) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }
  if (b.learner_user_id !== userId && b.expert_user_id !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await getUsersByIds([b.expert_user_id, b.learner_user_id]);
  const byId = new Map(users.map((u) => [u.user_id, u]));
  const expertU = byId.get(b.expert_user_id);
  const learnerU = byId.get(b.learner_user_id);
  const expertName = expertU ? displayName(expertU) : "—";
  const learnerName = learnerU ? displayName(learnerU) : "—";

  let rescheduleMessage: { created_at: string; sender_id: string } | null = null;
  const rid = b.reschedule_request_id ? String(b.reschedule_request_id) : "";
  if (rid) {
    const { data: msg, error: msgErr } = await admin
      .from("messages")
      .select("created_at, sender_id")
      .eq("message_id", rid)
      .maybeSingle();
    if (msgErr) {
      return Response.json({ error: publicApiError(msgErr) }, { status: 500 });
    }
    if (msg?.created_at && msg.sender_id) {
      rescheduleMessage = { created_at: String(msg.created_at), sender_id: String(msg.sender_id) };
    }
  }

  const breakdown = computeDependabilityBreakdown(
    {
      session_date: String(b.session_date),
      start_time: b.start_time,
      end_time: b.end_time,
      status: b.status,
      cancelled_at: b.cancelled_at,
      cancelled_by: b.cancelled_by,
      learner_user_id: String(b.learner_user_id),
      expert_user_id: String(b.expert_user_id),
      learner_joined: b.learner_joined,
      expert_joined: b.expert_joined,
      learner_delay: b.learner_delay,
      expert_delay: b.expert_delay,
      learner_dependability: b.learner_dependability,
      expert_dependability: b.expert_dependability,
      extensions: b.extensions,
      extensions_amount: b.extensions_amount,
      reschedule_request_id: b.reschedule_request_id,
    },
    userId,
    rescheduleMessage,
  );

  const sessionDateStr = String(b.session_date ?? "");
  const startInst = sessionWallClockInstant(sessionDateStr, b.start_time);
  const endInst = sessionWallClockInstant(sessionDateStr, b.end_time);

  const extCount = breakdown.extensionsCount;
  const extAmt = breakdown.extensionsAmountUsd;
  let totalExtensionSummary: string | null = null;
  if (extCount > 0 || extAmt > 0) {
    const parts: string[] = [];
    if (extCount > 0) {
      parts.push(`${extCount} extension segment${extCount === 1 ? "" : "s"}`);
    }
    parts.push("total minutes extended are not stored on the booking");
    if (extAmt > 0) {
      parts.push(`$${extAmt.toFixed(2)} in extension charges`);
    }
    totalExtensionSummary = parts.join(" · ");
  }

  return Response.json({
    breakdown,
    grid: {
      expertName,
      learnerName,
      sessionDateLabel: formatSessionDateCol(sessionDateStr),
      scheduledStartTimeLabel: startInst ? formatTimeOnly(startInst) : "—",
      scheduledEndTimeLabel: endInst ? formatTimeOnly(endInst) : "—",
      scheduledDurationLabel: formatDurationLabel(durationMinutesFromBooking(b)),
      totalExtensionSummary,
      canceledAtLabel: breakdown.cancelledAtIso ? formatJoin(breakdown.cancelledAtIso) : null,
      rescheduledAtLabel: breakdown.rescheduleMessageAtIso ? formatJoin(breakdown.rescheduleMessageAtIso) : null,
      expertJoinTimeLabel: formatJoin(b.expert_joined ?? null),
      learnerJoinTimeLabel: formatJoin(b.learner_joined ?? null),
    },
  });
}

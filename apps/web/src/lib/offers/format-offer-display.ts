import { formatTimeSlotLabel12h } from "@/components/expert/weeklyAvailabilityUtils";

export type OfferInboxLine = { label: string; value: string };

export type OfferInboxView = {
  typeLabel: string;
  lines: OfferInboxLine[];
  totalPriceUsd: number | null;
  companionMessage: string | null;
  senderFirstName: string | null;
  statusLabel: string | null;
};

function formatUsdTotal(n: unknown): number | null {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

function formatWallTimeLower(value: unknown): string {
  const s = String(value ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return s || "—";
  const hh = String(Number(m[1])).padStart(2, "0");
  const label = formatTimeSlotLabel12h(`${hh}:${m[2]}`);
  return label.replace(/\sAM$/i, "am").replace(/\sPM$/i, "pm");
}

function formatOfferDateLong(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
  const d = new Date(`${s}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return s;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function offerTypeLabel(offerType: string, payload: Record<string, unknown>): string {
  if (offerType === "time_suggestion") return "Suggested time";
  if (offerType === "package_deal") return "Multi-session package";
  if (offerType === "freelance_prep") return "Freelance / prep · review";
  const date = payload.proposed_session_date ?? payload.session_date;
  if (date && payload.start_time && payload.end_time) return "Suggested time";
  return "Custom session";
}

function statusLabel(status: string | null | undefined): string | null {
  if (!status || status === "offered") return null;
  if (status === "accepted") return "Accepted";
  if (status === "denied") return "Declined";
  if (status === "cancelled") return "Cancelled";
  if (status === "completed") return "Completed";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function totalFromPayload(payload: Record<string, unknown>): number | null {
  const quote = payload.quote_breakdown;
  if (quote && typeof quote === "object") {
    const t = formatUsdTotal((quote as Record<string, unknown>).total_offer_price_usd);
    if (t != null) return t;
  }
  return formatUsdTotal(payload.total_price ?? payload.custom_total_price ?? payload.package_price);
}

/** Pull companion note from legacy plain-text offer messages. */
export function companionMessageFromOfferBody(messageBody: string | null | undefined): string | null {
  if (!messageBody) return null;
  const marker = "\nMessage:\n";
  const idx = messageBody.indexOf(marker);
  if (idx === -1) return null;
  const text = messageBody.slice(idx + marker.length).trim();
  return text || null;
}

export function senderFirstNameFromDisplayName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function buildOfferInboxView(args: {
  offerType: string | null | undefined;
  payload: Record<string, unknown> | null | undefined;
  offerStatus?: string | null;
  companionMessage?: string | null;
  senderName?: string | null;
}): OfferInboxView | null {
  const payload = args.payload ?? null;
  const offerType = args.offerType ?? null;
  if (!payload || !offerType) return null;

  const lines: OfferInboxLine[] = [];
  const date = payload.proposed_session_date ?? payload.session_date;
  const start = payload.start_time;
  const end = payload.end_time;

  if (date) {
    lines.push({ label: "Requested date", value: formatOfferDateLong(date) });
  }
  if (start && end) {
    lines.push({
      label: "Time",
      value: `${formatWallTimeLower(start)} – ${formatWallTimeLower(end)}`,
    });
  }
  if (typeof payload.duration_minutes === "number") {
    lines.push({ label: "Duration", value: `${payload.duration_minutes} min` });
  } else if (payload.duration_hours != null) {
    lines.push({ label: "Duration", value: `${String(payload.duration_hours)} hrs` });
  }
  if (offerType === "package_deal") {
    const sessions = payload.session_count ?? payload.package_sessions;
    if (sessions != null) lines.push({ label: "Sessions", value: String(sessions) });
  }
  if (offerType === "freelance_prep" && payload.deadline) {
    lines.push({ label: "Deadline", value: formatOfferDateLong(payload.deadline) });
  }
  if (typeof payload.description === "string" && payload.description.trim()) {
    lines.push({ label: "Work", value: payload.description.trim() });
  }

  if (lines.length === 0) return null;

  return {
    typeLabel: offerTypeLabel(offerType, payload),
    lines,
    totalPriceUsd: totalFromPayload(payload),
    companionMessage: args.companionMessage?.trim() || null,
    senderFirstName: senderFirstNameFromDisplayName(args.senderName),
    statusLabel: statusLabel(args.offerStatus),
  };
}

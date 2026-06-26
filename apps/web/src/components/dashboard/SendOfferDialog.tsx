"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { dashboardInputClass } from "@/app/dashboard/DashboardViewShell";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { computeSessionCheckoutPricing, roundUsd2 } from "@/lib/sessionCheckoutPricing";
import { sessionBookingFeeFromRatePer15, sessionFeeFromWallTimes, ceilToBookingBlockMinutes } from "@/lib/offers/pricing";
import { durationMinutesBetweenWallTimes } from "@/lib/offers/session-time";
import { formatTimeSlotLabel12hFourDigit } from "@/components/expert/weeklyAvailabilityUtils";
import { ChevronDown, ChevronRight, Info } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientUserId: string;
  recipientFullName: string;
  recipientFirstName?: string | null;
  /** When set (e.g. opened from Manage on a booking), time-only submissions use `time_suggestion`. */
  relatedBookingId?: string | null;
  /** @deprecated Prefer loading rate from `/api/experts/availability` when dialog opens. */
  expertHourlyUsd?: number | null;
  onSubmitted?: () => void;
};

type OfferKind = "time_suggestion" | "custom_offer" | "package_deal" | "freelance_prep";

function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseUsd(raw: string): number | null {
  const trimmed = String(raw).replace(/,/g, "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? roundUsd2(n) : null;
}

function formatOfferLineUsd(amount: number | null): string {
  return amount != null ? `$${amount.toFixed(2)}` : "—";
}

function formatSuggestedOfferDate(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const d = new Date(`${ymd}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return ymd;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function formatSuggestedTimeRange(startHm: string, endHm: string): string {
  return `${formatTimeSlotLabel12hFourDigit(startHm)} - ${formatTimeSlotLabel12hFourDigit(endHm)}`;
}

function compilePayloadAndType(args: {
  relatedBookingId: string | null | undefined;
  date: string;
  startHm: string;
  endHm: string;
  customDurationMinutes: string;
  customPrice: string;
  customPriceResolvedUsd: number | null;
  packageSessions: string;
  packagePrice: string;
  freelanceHours: string;
  freelanceDeadline: string;
  freelancePrice: string;
  freelanceDescription: string;
  revealTime: boolean;
  revealCustom: boolean;
  revealPackage: boolean;
  revealFreelance: boolean;
  timeSessionFeeUsd: number | null;
  timeDurationMinutes: number | null;
}): { offerType: OfferKind; payload: Record<string, unknown> } | { error: string } {
  const timePayload = {
    proposed_session_date: args.date,
    start_time: `${args.startHm}:00`,
    end_time: `${args.endHm}:00`,
  };

  let count = 0;
  if (args.revealTime) count += 1;
  if (args.revealCustom) count += 1;
  if (args.revealPackage) count += 1;
  if (args.revealFreelance) count += 1;

  if (count === 0) return { error: "Expand at least one section (Suggest a Time, Custom Price, Package, or Freelance)." };

  const customPayloadPrice =
    args.customPriceResolvedUsd != null ? args.customPriceResolvedUsd : parseUsd(args.customPrice);

  if (count === 1 && args.revealTime) {
    if (!args.date || args.startHm.length < 4 || args.endHm.length < 4) {
      return { error: "Pick a day on the calendar, then enter start and end times." };
    }
    if (args.relatedBookingId) {
      return { offerType: "time_suggestion", payload: timePayload };
    }
    if (args.timeSessionFeeUsd == null || args.timeDurationMinutes == null) {
      return {
        error: "Set your published rate under Booking Preferences so we can price this session.",
      };
    }
    return {
      offerType: "custom_offer",
      payload: {
        ...timePayload,
        duration_minutes: args.timeDurationMinutes,
        total_price: args.timeSessionFeeUsd,
      },
    };
  }

  if (count === 1 && args.revealPackage) {
    const sessions = Number(args.packageSessions.replace(/,/g, "."));
    const price = parseUsd(args.packagePrice);
    if (!Number.isFinite(sessions) || sessions <= 0) return { error: "Enter a positive number of sessions." };
    if (price == null) return { error: "Enter a package price." };
    return { offerType: "package_deal", payload: { session_count: sessions, package_price: price } };
  }

  if (count === 1 && args.revealFreelance) {
    const hours = Number(args.freelanceHours.replace(/,/g, "."));
    const price = parseUsd(args.freelancePrice);
    if (!Number.isFinite(hours) || hours <= 0) return { error: "Enter duration in hours." };
    if (price == null) return { error: "Enter total price." };
    if (!args.freelanceDeadline) return { error: "Choose a deadline date." };
    const desc = args.freelanceDescription.trim();
    return {
      offerType: "freelance_prep",
      payload: {
        duration_hours: hours,
        deadline: args.freelanceDeadline,
        total_price: price,
        ...(desc ? { description: desc } : {}),
      },
    };
  }

  if (count === 1 && args.revealCustom) {
    const dm = Number(args.customDurationMinutes.replace(/,/g, "."));
    if (!Number.isFinite(dm) || dm <= 0) return { error: "Enter duration in minutes." };
    if (customPayloadPrice == null) return { error: "Enter a total price, or attach your hourly rate so we can derive it." };
    return {
      offerType: "custom_offer",
      payload: { duration_minutes: dm, total_price: customPayloadPrice },
    };
  }

  const payload: Record<string, unknown> = {};
  if (args.revealTime && args.date && args.startHm && args.endHm) {
    if (
      !args.relatedBookingId &&
      (args.timeSessionFeeUsd == null || args.timeDurationMinutes == null)
    ) {
      return {
        error: "Set your published rate under Booking Preferences so we can price this session.",
      };
    }
    Object.assign(payload, timePayload);
    if (!args.relatedBookingId && args.timeDurationMinutes != null && args.timeSessionFeeUsd != null) {
      payload.duration_minutes = args.timeDurationMinutes;
      payload.total_price = args.timeSessionFeeUsd;
    }
  }
  if (args.revealCustom) {
    const dm = Number(args.customDurationMinutes.replace(/,/g, "."));
    if (!Number.isFinite(dm) || dm <= 0) return { error: "Enter custom duration minutes." };
    payload.custom_duration_minutes = dm;
    if (customPayloadPrice == null) return { error: "Enter custom total price (or hourly rate)." };
    payload.custom_total_price = customPayloadPrice;
  }
  if (args.revealPackage) {
    const sessions = Number(args.packageSessions.replace(/,/g, "."));
    const price = parseUsd(args.packagePrice);
    if (!Number.isFinite(sessions) || sessions <= 0) return { error: "Enter package sessions count." };
    if (price == null) return { error: "Enter package price." };
    payload.package_sessions = sessions;
    payload.package_price_total = price;
  }
  if (args.revealFreelance) {
    const hours = Number(args.freelanceHours.replace(/,/g, "."));
    const price = parseUsd(args.freelancePrice);
    if (!Number.isFinite(hours) || hours <= 0) return { error: "Enter freelance hours." };
    if (price == null) return { error: "Enter freelance total price." };
    if (!args.freelanceDeadline) return { error: "Enter freelance deadline." };
    payload.freelance_hours = hours;
    payload.freelance_deadline = args.freelanceDeadline;
    payload.freelance_price = price;
    const desc = args.freelanceDescription.trim();
    if (desc) payload.freelance_description = desc;
  }

  return { offerType: "custom_offer", payload };
}

export function SendOfferDialog({
  open,
  onOpenChange,
  recipientUserId,
  recipientFullName,
  recipientFirstName,
  relatedBookingId,
  expertHourlyUsd = null,
  onSubmitted,
}: Props) {
  const fullName = recipientFullName.trim() || "this learner";
  const rn =
    recipientFirstName?.trim().split(/\s+/)[0] ?? recipientFullName.trim().split(/\s+/)[0] ?? "them";

  const [revealTime, setRevealTime] = useState(false);
  const [revealCustom, setRevealCustom] = useState(false);
  const [revealPackage, setRevealPackage] = useState(false);
  const [revealFreelance, setRevealFreelance] = useState(false);

  const [date, setDate] = useState("");
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
  const [startHm, setStartHm] = useState("09:00");
  const [endHm, setEndHm] = useState("10:00");
  const [customDurationMinutes, setCustomDurationMinutes] = useState("60");
  const [customPrice, setCustomPrice] = useState("");
  const [packageSessions, setPackageSessions] = useState("3");
  const [packagePrice, setPackagePrice] = useState("");
  const [freelanceHours, setFreelanceHours] = useState("2");
  const [freelanceDeadline, setFreelanceDeadline] = useState("");
  const [freelancePrice, setFreelancePrice] = useState("");
  const [freelanceDescription, setFreelanceDescription] = useState("");
  const [companionMessage, setCompanionMessage] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ratePer15Min, setRatePer15Min] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setRevealTime(Boolean(relatedBookingId));
    setRevealCustom(false);
    setRevealPackage(false);
    setRevealFreelance(false);
    setErr(null);

    let cancelled = false;
    (async () => {
      const res = await fetch("/api/experts/availability", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { availability?: { rate?: unknown } | null };
      const rate = Number(data.availability?.rate);
      if (!cancelled) {
        setRatePer15Min(Number.isFinite(rate) && rate > 0 ? rate : null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, relatedBookingId]);

  const effectiveRatePer15Min = useMemo(() => {
    if (ratePer15Min != null && ratePer15Min > 0) return ratePer15Min;
    if (typeof expertHourlyUsd === "number" && Number.isFinite(expertHourlyUsd) && expertHourlyUsd > 0) {
      return roundUsd2(expertHourlyUsd / 4);
    }
    return null;
  }, [ratePer15Min, expertHourlyUsd]);

  const timeSessionPricing = useMemo(() => {
    if (!revealTime || relatedBookingId) return null;
    if (effectiveRatePer15Min == null) return null;
    return sessionFeeFromWallTimes(effectiveRatePer15Min, startHm, endHm);
  }, [revealTime, relatedBookingId, effectiveRatePer15Min, startHm, endHm]);

  const customPriceOverrideUsd = useMemo(() => parseUsd(customPrice), [customPrice]);

  const customPriceResolvedUsd = useMemo(() => {
    if (customPriceOverrideUsd != null) return customPriceOverrideUsd;
    if (!revealCustom || effectiveRatePer15Min == null) return null;
    const dmRaw = Number(customDurationMinutes.replace(/,/g, "."));
    if (!Number.isFinite(dmRaw) || dmRaw <= 0) return null;
    const dm = ceilToBookingBlockMinutes(dmRaw);
    return sessionBookingFeeFromRatePer15(effectiveRatePer15Min, dm);
  }, [customPriceOverrideUsd, revealCustom, effectiveRatePer15Min, customDurationMinutes]);

  const bookingFeeSubtotal = useMemo(() => {
    let sub = 0;
    if (revealTime && !relatedBookingId && timeSessionPricing != null) {
      sub += timeSessionPricing.bookingFeeUsd;
    }
    if (revealCustom && customPriceResolvedUsd != null) sub += customPriceResolvedUsd;
    const pkg = parseUsd(packagePrice);
    if (revealPackage && pkg != null) sub += pkg;
    const free = parseUsd(freelancePrice);
    if (revealFreelance && free != null) sub += free;
    return roundUsd2(Math.max(0, sub));
  }, [
    revealTime,
    relatedBookingId,
    timeSessionPricing,
    revealCustom,
    customPriceResolvedUsd,
    revealPackage,
    packagePrice,
    revealFreelance,
    freelancePrice,
  ]);

  const checkoutStyle = useMemo(() => computeSessionCheckoutPricing(bookingFeeSubtotal), [bookingFeeSubtotal]);

  const suggestedTimeLabel = useMemo(() => {
    const timeRange = formatSuggestedTimeRange(startHm, endHm);
    return date ? `${formatSuggestedOfferDate(date)} | ${timeRange}` : timeRange;
  }, [date, startHm, endHm]);

  const freelanceTooltip =
    "Include tangible goals within your description, it will be sent to the user to approve completion before payment is released for freelance work.";

  async function submit() {
    setBusy(true);
    setErr(null);
    const res = compilePayloadAndType({
      relatedBookingId: relatedBookingId ?? null,
      date,
      startHm,
      endHm,
      customDurationMinutes,
      customPrice,
      customPriceResolvedUsd,
      packageSessions,
      packagePrice,
      freelanceHours,
      freelanceDeadline,
      freelancePrice,
      freelanceDescription,
      revealTime,
      revealCustom,
      revealPackage,
      revealFreelance,
      timeSessionFeeUsd: timeSessionPricing?.bookingFeeUsd ?? null,
      timeDurationMinutes: timeSessionPricing?.durationMinutes ?? null,
    });
    if ("error" in res) {
      setErr(res.error);
      setBusy(false);
      return;
    }
    const companion = companionMessage.trim() || undefined;

    try {
      const body: Record<string, unknown> = {
        toUserId: recipientUserId,
        offerType: res.offerType,
        payload: {
          ...res.payload,
          quote_breakdown: {
            booking_fee_usd: checkoutStyle.booking_amount,
            platform_fee_usd: checkoutStyle.platform_fee,
            taxes_and_fees_usd: checkoutStyle.taxes_fees,
            total_offer_price_usd: checkoutStyle.total_amount,
          },
        },
        companionMessage: companion ?? null,
      };
      if (relatedBookingId && res.offerType === "time_suggestion") {
        body.relatedBookingId = relatedBookingId;
      } else if (relatedBookingId) {
        body.relatedBookingId = relatedBookingId;
      }
      const out = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await out.json()) as { error?: string };
      if (!out.ok) {
        setErr(typeof data.error === "string" ? data.error : "Could not send offer");
        return;
      }
      onSubmitted?.();
      onOpenChange(false);
      setCompanionMessage("");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[min(92vh,840px)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-[#003049]/10 px-5 py-4 text-left">
            <DialogTitle className="text-[#003049]">Send an Offer</DialogTitle>
            <DialogDescription className="text-[#003049]/85">
              Create a custom offer for {fullName}. You can suggest a start time, duration, or customized price for a
              booking. You can also offer a discount for a multi-session package, and offer to do freelance work or offline
              prep/review for an upcoming session.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#003049]/70">Add to this offer</p>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 justify-between gap-2 border-[#003049]/18 py-3 text-left font-semibold text-[#003049]"
                  onClick={() => setRevealTime((x) => !x)}
                  aria-expanded={revealTime}
                >
                  <span>Suggest a Time</span>
                  {revealTime ? (
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                  )}
                </Button>
                {revealTime ? (
                  <div className="space-y-3 rounded-lg border border-[#003049]/12 bg-muted/35 p-3">
                    <p className="text-xs font-medium text-[#003049]/80">
                      Tap a day, then enter the session window you’re proposing.
                    </p>
                    {!relatedBookingId && effectiveRatePer15Min != null ? (
                      <p className="text-xs text-muted-foreground">
                        Session price uses your published rate (${effectiveRatePer15Min.toFixed(2)} per 15 min)
                        {timeSessionPricing
                          ? ` — ${timeSessionPricing.durationMinutes} min → $${timeSessionPricing.bookingFeeUsd.toFixed(2)}`
                          : startHm && endHm && durationMinutesBetweenWallTimes(startHm, endHm) == null
                            ? " — end time must be after start time"
                            : ""}
                        .
                      </p>
                    ) : !relatedBookingId ? (
                      <p className="text-xs text-amber-800">
                        Add your rate under Booking Preferences to auto-price this session.
                      </p>
                    ) : null}
                    <Calendar
                      mode="single"
                      selected={selectedDay}
                      onSelect={(d) => {
                        setSelectedDay(d);
                        if (d) setDate(toLocalYmd(d));
                      }}
                      className="mx-auto w-full max-w-[19rem] rounded-lg border border-[#003049]/10 bg-background p-2"
                      showOutsideDays
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-[#003049]/70">
                        Start time
                        <input
                          type="time"
                          className={`${dashboardInputClass} rounded-md`}
                          value={startHm}
                          onChange={(e) => setStartHm(e.target.value)}
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-[#003049]/70">
                        End time
                        <input
                          type="time"
                          className={`${dashboardInputClass} rounded-md`}
                          value={endHm}
                          onChange={(e) => setEndHm(e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                ) : null}

                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 justify-between gap-2 border-[#003049]/18 py-3 text-left font-semibold text-[#003049]"
                  onClick={() => setRevealCustom((x) => !x)}
                  aria-expanded={revealCustom}
                >
                  <span>Offer a Custom Price</span>
                  {revealCustom ? (
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                  )}
                </Button>
                {revealCustom ? (
                  <div className="space-y-2 rounded-lg border border-[#003049]/12 bg-muted/35 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-[#003049]/70">
                        Duration (minutes)
                        <input
                          className={`${dashboardInputClass} rounded-md`}
                          inputMode="numeric"
                          value={customDurationMinutes}
                          onChange={(e) => setCustomDurationMinutes(e.target.value)}
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-[#003049]/70">
                        Total price (USD)
                        <input
                          className={`${dashboardInputClass} rounded-md`}
                          inputMode="decimal"
                          value={customPrice}
                          onChange={(e) => setCustomPrice(e.target.value)}
                          placeholder={
                            effectiveRatePer15Min != null
                              ? "Blank → rate × duration"
                              : "0.00"
                          }
                        />
                      </label>
                    </div>
                    {effectiveRatePer15Min != null ? (
                      <p className="text-xs text-muted-foreground">
                        Published rate (${effectiveRatePer15Min.toFixed(2)} / 15 min): if Total price is blank, we use
                        rate × duration for the quote (
                        {customPriceResolvedUsd != null ? `$${customPriceResolvedUsd.toFixed(2)}` : "—"}).
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        If Total price is blank, configure your rate under Booking Preferences — we’ll derive price
                        from that on send when available.
                      </p>
                    )}
                  </div>
                ) : null}

                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 justify-between gap-2 border-[#003049]/18 py-3 text-left font-semibold text-[#003049]"
                  onClick={() => setRevealPackage((x) => !x)}
                  aria-expanded={revealPackage}
                >
                  <span>Suggest a Multi-Session Package</span>
                  {revealPackage ? (
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                  )}
                </Button>
                {revealPackage ? (
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#003049]/12 bg-muted/35 p-3">
                    <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-[#003049]/70">
                      Number of sessions
                      <input
                        className={`${dashboardInputClass} rounded-md`}
                        value={packageSessions}
                        onChange={(e) => setPackageSessions(e.target.value)}
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-[#003049]/70">
                      Package price (USD)
                      <input
                        className={`${dashboardInputClass} rounded-md`}
                        value={packagePrice}
                        onChange={(e) => setPackagePrice(e.target.value)}
                        placeholder="0.00"
                      />
                    </label>
                  </div>
                ) : null}

                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 justify-between gap-2 border-[#003049]/18 py-3 text-left font-semibold text-[#003049]"
                  onClick={() => setRevealFreelance((x) => !x)}
                  aria-expanded={revealFreelance}
                >
                  <span>Offer Freelance Work or Prep/Review Time</span>
                  {revealFreelance ? (
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                  )}
                </Button>
                {revealFreelance ? (
                  <div className="space-y-2 rounded-lg border border-[#003049]/12 bg-muted/35 p-3">
                    <div className="grid grid-cols-3 gap-2">
                      <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-[#003049]/70">
                        Duration (hours)
                        <input className={`${dashboardInputClass} rounded-md`} value={freelanceHours} onChange={(e) => setFreelanceHours(e.target.value)} />
                      </label>
                      <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-[#003049]/70">
                        Deadline
                        <input
                          type="date"
                          className={`${dashboardInputClass} rounded-md`}
                          value={freelanceDeadline}
                          onChange={(e) => setFreelanceDeadline(e.target.value)}
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-[#003049]/70">
                        Total price (USD)
                        <input className={`${dashboardInputClass} rounded-md`} value={freelancePrice} onChange={(e) => setFreelancePrice(e.target.value)} />
                      </label>
                    </div>
                    <label className="grid gap-1 text-xs font-medium text-[#003049]/80">
                      <span className="flex items-center gap-1">
                        Description of work
                        <Tooltip>
                          <TooltipTrigger type="button" className="inline-flex shrink-0 text-[#003049]/65">
                            <Info className="h-4 w-4" aria-label="Freelance description help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs leading-snug">
                            {freelanceTooltip}
                          </TooltipContent>
                        </Tooltip>
                      </span>
                      <Textarea
                        rows={4}
                        value={freelanceDescription}
                        onChange={(e) => setFreelanceDescription(e.target.value)}
                        className={`${dashboardInputClass} mt-1 resize-y rounded-md`}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#003049]/70">Offer details</p>
              <div className="mt-3 space-y-2 rounded-lg border border-[#003049]/12 bg-muted/25 px-4 py-3 text-sm">
                {!revealTime && !revealCustom && !revealPackage && !revealFreelance ? (
                  <p className="text-xs text-muted-foreground">Use the buttons above to add line items.</p>
                ) : (
                  <>
                    {revealTime ? (
                      <div className="flex justify-between gap-4 border-b border-dashed border-[#003049]/15 py-2 last:border-b-0">
                        <span className="text-[#003049]/85">Suggested time</span>
                        <span className="text-right text-[#003049]">
                          {suggestedTimeLabel}
                          {!relatedBookingId ? (
                            <span className="ml-1 font-medium tabular-nums">
                              · {formatOfferLineUsd(timeSessionPricing?.bookingFeeUsd ?? null)}
                              {timeSessionPricing && effectiveRatePer15Min != null ? (
                                <span className="ml-1 text-[11px] font-normal text-muted-foreground">(from rate)</span>
                              ) : effectiveRatePer15Min == null ? (
                                <span className="ml-1 text-[11px] font-normal text-muted-foreground">(set rate)</span>
                              ) : null}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    ) : null}
                    {revealCustom ? (
                      <div className="flex justify-between gap-4 border-b border-dashed border-[#003049]/15 py-2 last:border-b-0">
                        <span className="text-[#003049]/85">Custom session ({customDurationMinutes} min)</span>
                        <span className="tabular-nums font-medium text-[#003049]">
                          {formatOfferLineUsd(customPriceResolvedUsd)}
                          {customPriceOverrideUsd == null && customPriceResolvedUsd != null ? (
                            <span className="ml-1 text-[11px] font-normal text-muted-foreground">(from rate)</span>
                          ) : null}
                        </span>
                      </div>
                    ) : null}
                    {revealPackage ? (
                      <div className="flex justify-between gap-4 border-b border-dashed border-[#003049]/15 py-2 last:border-b-0">
                        <span className="text-[#003049]/85">{packageSessions}× package</span>
                        <span className="tabular-nums font-medium text-[#003049]">${(parseUsd(packagePrice) ?? 0).toFixed(2)}</span>
                      </div>
                    ) : null}
                    {revealFreelance ? (
                      <div className="flex justify-between gap-4 border-b border-dashed border-[#003049]/15 py-2 last:border-b-0">
                        <span className="text-[#003049]/85">Freelance / prep–review ({freelanceHours} hrs)</span>
                        <span className="tabular-nums font-medium text-[#003049]">${(parseUsd(freelancePrice) ?? 0).toFixed(2)}</span>
                      </div>
                    ) : null}
                  </>
                )}
                <div className="mt-3 border-t border-[#003049]/15 pt-2 text-xs leading-relaxed">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Session / offer subtotal (before Convene fees)</span>
                    <span className="tabular-nums font-medium">${checkoutStyle.booking_amount.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-4">
                    <span className="text-muted-foreground">Platform fee</span>
                    <span className="tabular-nums">${checkoutStyle.platform_fee.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-4">
                    <span className="text-muted-foreground">Taxes and fees</span>
                    <span className="tabular-nums">${checkoutStyle.taxes_fees.toFixed(2)}</span>
                  </div>
                  <div className="mt-3 flex justify-between gap-4 border-t border-[#003049]/10 pt-2 text-base font-bold text-[#003049]">
                    <span>Total offer price</span>
                    <span className="tabular-nums">${checkoutStyle.total_amount.toFixed(2)}</span>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Priced lines use Convene checkout math (same as session booking): 10% platform fee; 6% taxes/fees on
                    subtotal. Reschedule-only time offers keep the existing booking price.
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <label className="grid gap-2 text-sm font-medium text-[#003049]">
              Send a message to {rn}
              <Textarea
                rows={4}
                placeholder="Optional introduction that goes alongside the structured offer …"
                value={companionMessage}
                onChange={(e) => setCompanionMessage(e.target.value)}
                className={`${dashboardInputClass} rounded-md resize-y`}
              />
            </label>

            {err ? <p className="text-sm text-red-600">{err}</p> : null}
          </div>

          <DialogFooter className="border-t border-[#003049]/10 bg-white px-5 py-3">
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" className="bg-[#F77F00] text-white hover:bg-[#F77F00]/92" disabled={busy} onClick={() => void submit()}>
                {busy ? "Sending…" : "Send Offer"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

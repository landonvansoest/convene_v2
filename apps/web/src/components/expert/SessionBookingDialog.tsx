"use client";

import { Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ExpertAvailabilityForPreview } from "@/lib/expertBookingPreview";
import { buildBookingSlotRowFromAnchor } from "@/lib/expertBookingPreview";
import { computeSessionCheckoutPricing, roundUsd2 } from "@/lib/sessionCheckoutPricing";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { VisibleTempDot } from "@/components/presence/VisibleTempDot";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { syncSessionPaymentWithServer } from "@/lib/stripe/syncSessionPaymentClient";
import {
  SESSION_PAYMENT_ELEMENT_OPTIONS,
  SESSION_PAYMENT_ELEMENTS_APPEARANCE,
} from "@/lib/stripe/sessionPaymentElementOptions";
import { sanitizeStripeMessageForUi } from "@/lib/stripe/stripeMessageUi";
import { SessionPaymentMethodBlock } from "@/components/stripe/SessionPaymentMethodBlock";
import { stripePromise } from "@/lib/stripe/loadStripeClient";
import { dispatchHeaderBadgesMayHaveChanged } from "@/lib/messages/inbox-unread-events";
import { cn } from "@/lib/utils";

function formatPaymentIntentApiError(error: unknown): string {
  if (typeof error === "string" && error.trim()) return sanitizeStripeMessageForUi(error, "session_booking");
  if (error && typeof error === "object") {
    const o = error as { formErrors?: unknown; fieldErrors?: Record<string, unknown> };
    const fe = o.formErrors;
    if (Array.isArray(fe) && fe.length) {
      return fe.filter((x) => typeof x === "string").join("; ") || "Invalid payment request";
    }
    const fields = o.fieldErrors;
    if (fields && typeof fields === "object") {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(fields)) {
        if (Array.isArray(v)) parts.push(...v.map((m) => `${k}: ${String(m)}`));
      }
      if (parts.length) return parts.join("; ");
    }
  }
  return sanitizeStripeMessageForUi("Payment setup failed", "session_booking");
}

function formatDurationLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr${h === 1 ? "" : "s"}`;
  return `${h} hr${h === 1 ? "" : "s"} ${m} min`;
}

function wallTimeFourDigitLabel(utcMs: number, tz: string): string {
  const d = new Date(utcMs);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const hour = Number(parts.find((x) => x.type === "hour")?.value ?? "12");
  const minute = Number(parts.find((x) => x.type === "minute")?.value ?? "0");
  const dayPeriod = (parts.find((x) => x.type === "dayPeriod")?.value ?? "AM").toUpperCase();
  const suf = dayPeriod.startsWith("P") ? "pm" : "am";
  return `${hour}:${String(minute).padStart(2, "0")}${suf}`;
}

function formatLongDate(utcMs: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(utcMs));
}

function timeZoneAbbrevAt(utcMs: number, iana: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: iana,
      timeZoneName: "short",
    }).formatToParts(new Date(utcMs));
    return parts.find((p) => p.type === "timeZoneName")?.value?.trim() || iana;
  } catch {
    return iana;
  }
}

type BookStep = "book" | "request_sent";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expertId: string;
  expertName: string;
  expertTitle: string;
  expertPhoto: string | null;
  expertVisibilityState?: string | null;
  ratePer15Min: number;
  autoAccept: boolean;
  minBookingMinutes: number;
  maxBookingMinutes: number;
  availability: ExpertAvailabilityForPreview | null;
  expertTimeZone: string | null;
  /** e.g. "Pacific Time" — shown with session times; falls back to IANA abbreviations. */
  expertTimeZoneDisplayLabel?: string | null;
  /** When set (e.g. signed-in viewer profile `time_zone`), chip labels and session copy use this IANA zone. */
  displayWallTimeZone?: string | null;
  anchorUtcMs: number | null;
  firstSessionDiscountAvailable: boolean;
  onRequestSignIn?: () => void;
};

export function SessionBookingDialog({
  open,
  onOpenChange,
  expertId,
  expertName,
  expertTitle,
  expertPhoto,
  expertVisibilityState = null,
  ratePer15Min,
  minBookingMinutes,
  maxBookingMinutes,
  availability,
  expertTimeZone,
  expertTimeZoneDisplayLabel,
  displayWallTimeZone,
  anchorUtcMs,
  firstSessionDiscountAvailable,
  onRequestSignIn,
}: Props) {
  const expertFirstName = useMemo(() => {
    const p = expertName.trim().split(/\s+/)[0] ?? "this expert";
    return p || "this expert";
  }, [expertName]);

  const [row, setRow] = useState<{ utcMs: number; label: string }[]>([]);
  /** Inclusive chip indices; `null` = user cleared all slots. */
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [applyDiscount, setApplyDiscount] = useState(false);
  const [bookStep, setBookStep] = useState<BookStep>("book");
  const [payOpen, setPayOpen] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [pricingState, setPricingState] = useState<ReturnType<typeof computeSessionCheckoutPricing> | null>(
    null,
  );
  const [priceBreakdownOpen, setPriceBreakdownOpen] = useState(false);

  /** Closing the book dialog after “Book Session” must not wipe PI / chip state. */
  const preserveBookStateRef = useRef(false);
  /** Same-tick as payment modal; state `payOpen` can lag one frame behind Radix close events. */
  const payOpenRef = useRef(false);

  const tzSafe = useMemo(() => {
    const ex = expertTimeZone?.trim() || "UTC";
    const wall = displayWallTimeZone?.trim();
    if (!wall) return ex;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: wall }).format(new Date(0));
      return wall;
    } catch {
      return ex;
    }
  }, [expertTimeZone, displayWallTimeZone]);

  const resetBookOnly = useCallback(() => {
    setBookStep("book");
    setErr(null);
    setPricingState(null);
    setPriceBreakdownOpen(false);
  }, []);

  const resetEverything = useCallback(() => {
    resetBookOnly();
    setClientSecret(null);
    setPayOpen(false);
    setPaySuccess(false);
    setPayErr(null);
    setRow([]);
    setRange(null);
  }, [resetBookOnly]);

  useEffect(() => {
    if (!open || anchorUtcMs == null) return;
    resetBookOnly();
    setApplyDiscount(false);
    preserveBookStateRef.current = false;
    const chips = buildBookingSlotRowFromAnchor(availability, expertTimeZone, anchorUtcMs, new Date(), {
      labelTimeZone: displayWallTimeZone?.trim() || undefined,
    });
    setRow(chips);
    const needSlots = Math.max(1, Math.ceil(minBookingMinutes / 15));
    const end = Math.min(Math.max(0, chips.length - 1), Math.max(0, needSlots - 1));
    setRange(chips.length ? { start: 0, end } : null);
  }, [open, anchorUtcMs, availability, expertTimeZone, displayWallTimeZone, minBookingMinutes, resetBookOnly]);

  useEffect(() => {
    payOpenRef.current = payOpen;
  }, [payOpen]);

  const startIdx = range?.start ?? 0;
  const endIdx = range?.end ?? 0;
  const durationMinutes = range != null && row.length > 0 ? (endIdx - startIdx + 1) * 15 : 0;
  const numBlocks = range != null && row.length > 0 ? endIdx - startIdx + 1 : 0;

  const listBookingFee = useMemo(
    () => roundUsd2(ratePer15Min * numBlocks),
    [ratePer15Min, numBlocks],
  );

  const estimatePricing = useMemo(
    () => (numBlocks > 0 ? computeSessionCheckoutPricing(listBookingFee) : null),
    [listBookingFee, numBlocks],
  );

  const startUtc = range != null ? row[startIdx]?.utcMs : undefined;
  const durationOk = durationMinutes >= minBookingMinutes && durationMinutes <= maxBookingMinutes;

  const tzDisplay = useMemo(() => {
    const trimmed = expertTimeZoneDisplayLabel?.trim();
    if (trimmed) return trimmed;
    const refMs = startUtc ?? Date.now();
    try {
      const part = new Intl.DateTimeFormat("en-US", {
        timeZone: tzSafe,
        timeZoneName: "longGeneric",
      })
        .formatToParts(new Date(refMs))
        .find((p) => p.type === "timeZoneName")?.value?.trim();
      return part || tzSafe;
    } catch {
      return tzSafe;
    }
  }, [expertTimeZoneDisplayLabel, startUtc, tzSafe]);

  const timeLineWithZones = useCallback(
    (startMs: number, endMs: number) => {
      const a = timeZoneAbbrevAt(startMs, tzSafe);
      const b = timeZoneAbbrevAt(endMs, tzSafe);
      const startWall = wallTimeFourDigitLabel(startMs, tzSafe);
      const endWall = wallTimeFourDigitLabel(endMs, tzSafe);
      if (a === b) {
        return `${startWall} – ${endWall} ${tzDisplay}`;
      }
      return `${startWall} ${a} – ${endWall} ${b}`;
    },
    [tzDisplay, tzSafe],
  );

  function onChipClick(idx: number) {
    if (!row.length) return;
    if (idx < 0 || idx >= row.length) return;

    if (range == null) {
      setRange({ start: idx, end: idx });
      return;
    }

    const { start: s, end: e } = range;
    const inRange = idx >= s && idx <= e;

    if (inRange) {
      if (idx === e && e > s) {
        setRange({ start: s, end: e - 1 });
        return;
      }
      if (idx === s && s < e) {
        setRange({ start: s + 1, end: e });
        return;
      }
      if (idx === s && idx === e) {
        setRange(null);
        return;
      }
      if (idx > s && idx < e) {
        setRange({ start: s, end: idx - 1 });
        return;
      }
    }

    if (idx < s) {
      setRange({ start: idx, end: idx });
      return;
    }
    if (idx > e) {
      if (idx === e + 1) setRange({ start: s, end: idx });
      else setRange({ start: idx, end: idx });
      return;
    }
  }

  async function onBookSession() {
    setErr(null);
    if (startUtc == null || range == null || !durationOk) {
      setErr(`Choose a duration between ${minBookingMinutes} and ${maxBookingMinutes} minutes.`);
      return;
    }
    const sb = createBrowserSupabase();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session?.user) {
      onRequestSignIn?.();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/experts/${encodeURIComponent(expertId)}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUtcMs: startUtc,
          durationMinutes,
          applyFirstSessionDiscount: applyDiscount && firstSessionDiscountAvailable,
        }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Could not create booking");
        return;
      }
      const auto = Boolean(data.auto_accept);
      const deferred = Boolean(data.deferred_checkout);
      const pricing = data.pricing as ReturnType<typeof computeSessionCheckoutPricing> | undefined;
      if (pricing) setPricingState(pricing);

      if (auto) {
        if (!stripePromise) {
          setErr("Payment is not configured.");
          return;
        }
        const checkoutAttemptId =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const piBody = deferred
          ? {
              expertUserId: expertId,
              startUtcMs: startUtc,
              durationMinutes,
              applyFirstSessionDiscount: applyDiscount && firstSessionDiscountAvailable,
              checkoutAttemptId,
            }
          : {
              expertUserId: expertId,
              bookingId: String((data.booking as Record<string, unknown> | undefined)?.booking_id ?? ""),
            };
        if (!deferred && !("bookingId" in piBody && piBody.bookingId)) {
          setErr("Booking created but missing id");
          return;
        }
        const piRes = await fetch("/api/stripe/create-payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(piBody),
        });
        let piJson: { clientSecret?: string; error?: unknown } = {};
        try {
          piJson = (await piRes.json()) as {
            clientSecret?: string;
            error?: unknown;
          };
        } catch {
          piJson = {};
        }
        if (!piRes.ok) {
          setErr(formatPaymentIntentApiError(piJson.error));
          return;
        }
        if (!piJson.clientSecret) {
          setErr("No payment client secret");
          return;
        }
        preserveBookStateRef.current = true;
        payOpenRef.current = true;
        flushSync(() => {
          setClientSecret(piJson.clientSecret ?? null);
          setPayErr(null);
          setPaySuccess(false);
          setPayOpen(true);
        });
        onOpenChange(false);
      } else {
        setBookStep("request_sent");
      }
    } finally {
      setBusy(false);
    }
  }

  const endDisplayMs =
    startUtc != null && range != null && row.length > 0
      ? startUtc + (endIdx - startIdx + 1) * 15 * 60_000
      : null;

  const breakdownPricing = pricingState ?? estimatePricing;

  const initials = expertName
    .split(/\s+/)
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function handlePaymentDialogOpenChange(next: boolean) {
    payOpenRef.current = next;
    setPayOpen(next);
    if (!next) {
      preserveBookStateRef.current = false;
      setClientSecret(null);
      setPaySuccess(false);
      setPayErr(null);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            if (!preserveBookStateRef.current && !payOpenRef.current) {
              resetEverything();
            }
          } else {
            preserveBookStateRef.current = false;
          }
          onOpenChange(v);
        }}
      >
        <DialogContent className="max-h-[90vh] w-full min-w-0 max-w-lg overflow-x-hidden overflow-y-auto border-border bg-card sm:max-w-xl">
          {bookStep === "book" ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-left text-xl font-bold text-convene-primary">
                  Book a Session with {expertName}
                </DialogTitle>
                <DialogDescription className="whitespace-pre-line text-left text-sm text-foreground">
                  {`Click consecutive time slots to create your booking.\n${expertFirstName} allows bookings between ${formatDurationLabel(minBookingMinutes)} and ${formatDurationLabel(maxBookingMinutes)}.`}
                </DialogDescription>
              </DialogHeader>

              <div className="min-w-0 w-full space-y-3">
                <div className="w-full min-w-0 max-w-full overflow-hidden">
                  <div className="flex flex-nowrap gap-2 overflow-x-auto overflow-y-hidden pb-1 pt-0.5 scroll-smooth [scrollbar-width:thin]">
                  {row.map((s, idx) => {
                    const active = range != null && idx >= startIdx && idx <= endIdx;
                    return (
                      <button
                        key={s.utcMs}
                        type="button"
                        onClick={() => onChipClick(idx)}
                        className={cn(
                          "shrink-0 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                          active
                            ? "border-convene-primary bg-convene-hero text-white"
                            : "border-border bg-background text-foreground",
                        )}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                  </div>
                </div>

                <p className="text-sm font-semibold text-convene-primary">
                  Session duration:{" "}
                  <span className="text-convene-hero">{formatDurationLabel(durationMinutes)}</span>
                </p>
                {!durationOk && row.length > 0 && range != null ? (
                  <p className="text-xs text-amber-700">
                    Duration must be between {formatDurationLabel(minBookingMinutes)} and{" "}
                    {formatDurationLabel(maxBookingMinutes)}.
                  </p>
                ) : null}
                {range == null && row.length > 0 ? (
                  <p className="text-xs text-muted-foreground">Select a time slot to begin.</p>
                ) : null}
                {err ? <p className="text-sm text-destructive">{err}</p> : null}

                {firstSessionDiscountAvailable ? (
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={applyDiscount}
                      onChange={(e) => setApplyDiscount(e.target.checked)}
                    />
                    Apply first-session discount (if eligible)
                  </label>
                ) : null}

                <div className="space-y-2 rounded-lg bg-convene-primary px-4 py-3 text-white">
                  <p className="font-bold">Booking details</p>
                  {startUtc != null && estimatePricing ? (
                    <>
                      <div className="grid grid-cols-[64px_1fr] gap-1 text-sm">
                        <span className="text-white/80">Date</span>
                        <span>{formatLongDate(startUtc, tzSafe)}</span>
                        <span className="text-white/80">Time</span>
                        <span>
                          {endDisplayMs != null ? timeLineWithZones(startUtc, endDisplayMs) : ""}
                        </span>
                        <span className="text-white/80">Duration</span>
                        <span>{formatDurationLabel(durationMinutes)}</span>
                      </div>
                      <Separator className="my-2 bg-white/20" />
                      <div className="space-y-2 text-sm">
                        {applyDiscount && firstSessionDiscountAvailable ? (
                          <p className="text-xs text-white/80">
                            First-session discount is applied when you continue (if eligible); totals may
                            change slightly.
                          </p>
                        ) : null}
                        <div className="flex justify-between gap-3">
                          <span className="min-w-0 pr-2 text-white/95">
                            Booking Fee (${ratePer15Min.toFixed(2)} × {numBlocks}{" "}
                            {numBlocks === 1 ? "block" : "blocks"})
                          </span>
                          <span className="shrink-0 font-medium tabular-nums">
                            ${estimatePricing.subtotal_before_tax.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Taxes and Fees</span>
                          <span className="font-medium tabular-nums">
                            ${estimatePricing.taxes_fees.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3 border-t border-white/25 pt-2 text-xl font-bold text-white">
                          <span>Total (in USD)</span>
                          <span className="tabular-nums">${estimatePricing.total_amount.toFixed(2)}</span>
                        </div>
                        <button
                          type="button"
                          className="text-left text-xs text-white/85 underline underline-offset-2 hover:text-white"
                          onClick={() => setPriceBreakdownOpen(true)}
                        >
                          Price Breakdown
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-white/80">Select times above to see pricing.</p>
                  )}
                </div>

                <Button
                  type="button"
                  className="w-full bg-convene-hero text-white hover:opacity-95"
                  disabled={busy || !durationOk || !row.length || range == null}
                  onClick={() => void onBookSession()}
                >
                  {busy ? "Working…" : "Book Session"}
                </Button>
              </div>
            </>
          ) : null}

          {bookStep === "request_sent" ? (
            <div className="space-y-4 py-2">
              <DialogTitle className="text-xl font-bold text-convene-primary">Request sent</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Your booking request was sent to {expertFirstName}. They can approve, decline, or send you a
                different offer. We&apos;ll notify you by message when they respond.
              </p>
              <Button
                type="button"
                className="w-full bg-convene-primary text-white"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={payOpen} onOpenChange={(o) => handlePaymentDialogOpenChange(o)}>
        <DialogContent className="z-[210] max-h-[90vh] max-w-lg overflow-y-auto border-border bg-card sm:max-w-md">
          {!paySuccess ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-left text-xl font-bold text-convene-primary">
                  Complete payment
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Enter payment details to confirm your session with {expertName}.
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-start gap-3 border-b border-border pb-4">
                <div className="relative h-16 w-16 shrink-0">
                  <Avatar className="h-full w-full border border-border">
                    {expertPhoto ? (
                      <AvatarImage src={expertPhoto} alt="" className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-muted text-lg font-semibold text-convene-primary">
                      {initials || "EX"}
                    </AvatarFallback>
                  </Avatar>
                  <VisibleTempDot expertVisibilityState={expertVisibilityState} />
                </div>
                <div className="min-w-0 pt-0.5">
                  <p className="text-lg font-semibold text-foreground">{expertName}</p>
                  <p className="text-sm text-muted-foreground">{expertTitle}</p>
                </div>
              </div>

              {pricingState && startUtc != null ? (
                <div className="rounded-lg border border-border bg-muted/25 p-4 text-sm">
                  <p className="font-semibold text-convene-primary">Session details</p>
                  <dl className="mt-3 space-y-2 text-foreground">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Date</dt>
                      <dd className="text-right font-medium">{formatLongDate(startUtc, tzSafe)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Time</dt>
                      <dd className="text-right font-medium">
                        {timeLineWithZones(startUtc, startUtc + durationMinutes * 60_000)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Duration</dt>
                      <dd className="text-right font-medium">{formatDurationLabel(durationMinutes)}</dd>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between gap-4 text-base font-bold text-convene-primary">
                      <dt>Total (USD)</dt>
                      <dd className="tabular-nums">${pricingState.total_amount.toFixed(2)}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}

              {payErr ? <p className="text-sm text-destructive">{payErr}</p> : null}

              {clientSecret && stripePromise ? (
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: SESSION_PAYMENT_ELEMENTS_APPEARANCE,
                  }}
                >
                  <PayStep
                    onSuccess={() => {
                      setPaySuccess(true);
                      dispatchHeaderBadgesMayHaveChanged();
                    }}
                    setErr={setPayErr}
                  />
                </Elements>
              ) : payOpen ? (
                <p className="text-sm text-muted-foreground">Payment form unavailable.</p>
              ) : null}
            </>
          ) : (
            <div className="space-y-4 py-2">
              <h2 className="text-xl font-bold text-convene-primary">
                Booking successful! <span aria-hidden>🎉</span>
              </h2>
              <p className="text-sm text-muted-foreground">
                Your session with {expertName} has been confirmed.
              </p>
              <div className="rounded-lg border border-border bg-muted/25 p-4 text-sm">
                <p className="font-semibold text-convene-primary">Booking details</p>
                <dl className="mt-3 space-y-2 text-foreground">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Expert</dt>
                    <dd className="text-right font-medium">{expertName}</dd>
                  </div>
                  {startUtc != null ? (
                    <>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Session date</dt>
                        <dd className="text-right font-medium">{formatLongDate(startUtc, tzSafe)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Session time</dt>
                        <dd className="min-w-0 max-w-[62%] text-right text-sm font-medium leading-snug">
                          {timeLineWithZones(startUtc, startUtc + durationMinutes * 60_000)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Duration</dt>
                        <dd className="text-right font-medium">{formatDurationLabel(durationMinutes)}</dd>
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Session timing unavailable.</p>
                  )}
                </dl>
              </div>
              <p className="text-sm text-muted-foreground">
                Booking details are available on your dashboard page. A link to join your session will be active 10
                minutes before the scheduled start time.
              </p>
              <Button asChild className="w-full bg-convene-primary text-white">
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={priceBreakdownOpen} onOpenChange={setPriceBreakdownOpen}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-convene-primary">Price Breakdown</DialogTitle>
          </DialogHeader>
          {breakdownPricing ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span>Expert Rate per Block</span>
                <span className="tabular-nums">${ratePer15Min.toFixed(2)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Number of Blocks Booked</span>
                <span className="tabular-nums">{numBlocks}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Platform Fee</span>
                <span className="tabular-nums">${breakdownPricing.platform_fee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Taxes</span>
                <span className="tabular-nums">${breakdownPricing.taxes_fees.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between gap-3 text-base font-bold text-convene-primary">
                <span>Total (in USD)</span>
                <span className="tabular-nums">${breakdownPricing.total_amount.toFixed(2)}</span>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PayStep({
  onSuccess,
  setErr,
}: {
  onSuccess: () => void;
  setErr: (s: string | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setErr(null);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (error) {
      setBusy(false);
      setErr(sanitizeStripeMessageForUi(error.message ?? "Payment failed", "session_booking"));
      return;
    }
    if (paymentIntent?.status === "succeeded" && paymentIntent.id) {
      const synced = await syncSessionPaymentWithServer(paymentIntent.id);
      if ("error" in synced) {
        setBusy(false);
        setErr(sanitizeStripeMessageForUi(synced.error, "session_booking"));
        return;
      }
    }
    setBusy(false);
    if (paymentIntent?.status === "succeeded") {
      onSuccess();
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
      <SessionPaymentMethodBlock options={SESSION_PAYMENT_ELEMENT_OPTIONS} />
      <Button
        type="submit"
        disabled={!stripe || busy}
        className="w-full bg-convene-hero text-white hover:opacity-95"
      >
        {busy ? "Processing…" : "Complete payment"}
      </Button>
    </form>
  );
}

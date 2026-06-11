"use client";

import { Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import Image from "next/image";
import { Calendar, Clock, DollarSign, Loader2, Timer } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { syncSessionPaymentWithServer } from "@/lib/stripe/syncSessionPaymentClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  SESSION_PAYMENT_ELEMENT_OPTIONS,
  SESSION_PAYMENT_ELEMENTS_APPEARANCE,
} from "@/lib/stripe/sessionPaymentElementOptions";
import { SessionPaymentMethodBlock } from "@/components/stripe/SessionPaymentMethodBlock";
import { PAYMENT_CHECKOUT_DIALOG_CONTENT_CLASS } from "@/components/stripe/checkoutDialogStyles";
import { STRIPE_PUBLISHABLE_KEY, stripePromise } from "@/lib/stripe/loadStripeClient";
import { dispatchHeaderBadgesMayHaveChanged } from "@/lib/messages/inbox-unread-events";
import { sanitizeStripeMessageForUi } from "@/lib/stripe/stripeMessageUi";

function redactStripeSecrets(message: string): string {
  return message.replace(/sk_(?:test|live)_[^\s]+/gi, "sk_…");
}

function formatPiError(data: unknown): string {
  let raw = "Payment setup failed";
  if (typeof data === "object" && data !== null && "error" in data) {
    const e = (data as { error?: unknown }).error;
    if (typeof e === "string") raw = e;
    if (typeof e === "object" && e !== null && "message" in e) {
      const m = (e as { message?: unknown }).message;
      if (typeof m === "string") raw = m;
    }
  }
  return sanitizeStripeMessageForUi(redactStripeSecrets(raw), "session_booking");
}

function timeStrToMinutes(t: unknown): number | null {
  const s = String(t ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function durationMinutesFromBookingRow(b: {
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

function formatLongSessionDate(sessionDate: string): string {
  const parts = sessionDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return sessionDate;
  const [y, mo, da] = parts;
  const d = new Date(Date.UTC(y, mo - 1, da));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function sessionInstant(sessionDate: string, time: string | undefined): Date | null {
  const st = (time || "00:00:00").toString();
  const timePart =
    st.length >= 8 ? st.slice(0, 8) : st.length >= 5 ? `${st.slice(0, 5)}:00` : "00:00:00";
  const dt = new Date(`${sessionDate}T${timePart}`);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function formatTimeRange(
  sessionDate: string,
  startTime: string | undefined,
  endTime: string | undefined,
): string {
  const a = sessionInstant(sessionDate, startTime);
  const b = sessionInstant(sessionDate, endTime);
  if (!a || !b) return "—";
  const o = { hour: "numeric", minute: "2-digit" } as const;
  return `${a.toLocaleTimeString("en-US", o)} - ${b.toLocaleTimeString("en-US", o)}`;
}

function formatDurationShort(mins: number | null): string {
  if (mins == null || !Number.isFinite(mins)) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

function SessionPayForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [err, setErr] = useState<string | null>(null);
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
      setErr(sanitizeStripeMessageForUi(redactStripeSecrets(error.message ?? "Payment failed"), "session_booking"));
      return;
    }
    if (paymentIntent?.status === "succeeded" && paymentIntent.id) {
      const synced = await syncSessionPaymentWithServer(paymentIntent.id);
      if ("error" in synced) {
        setBusy(false);
        setErr(sanitizeStripeMessageForUi(redactStripeSecrets(synced.error), "session_booking"));
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
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      <Button
        type="submit"
        disabled={!stripe || busy}
        className="w-full bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
      >
        {busy ? "Processing…" : "Complete payment"}
      </Button>
    </form>
  );
}

export type SessionPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string | null;
  /** Called after a successful payment (before dialog closes). */
  onPaid?: () => void;
};

type BookingPreview = {
  partner_name: string;
  partner_photo: string | null;
  partner_profession: string | null;
  session_date: string;
  start_time: string;
  end_time: string;
  total_amount: number;
  durationMinutes: number | null;
};

/**
 * v1-style payment modal: expert header, primary-blue session card, Stripe Element, Cancel.
 */
export function SessionPaymentDialog({ open, onOpenChange, bookingId, onPaid }: SessionPaymentDialogProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [bookingPreview, setBookingPreview] = useState<BookingPreview | null>(null);
  const [paySuccess, setPaySuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setClientSecret(null);
      setLoadErr(null);
      setBookingPreview(null);
      setPaySuccess(false);
      return;
    }
    if (!bookingId) return;

    let cancelled = false;
    (async () => {
      setLoadErr(null);
      setClientSecret(null);
      setBookingPreview(null);
      setPaySuccess(false);

      const bRes = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}`);
      const bJson = (await bRes.json()) as Record<string, unknown>;
      if (cancelled) return;
      if (!bRes.ok) {
        setLoadErr(typeof bJson.error === "string" ? bJson.error : "Failed to load booking");
        return;
      }
      const b = bJson.booking as Record<string, unknown> | undefined;
      if (!b) {
        setLoadErr("Invalid booking response");
        return;
      }
      if (b.user_role !== "learner") {
        setLoadErr("Only the learner can pay for this booking.");
        return;
      }
      const ps = String(b.payment_status ?? "").toLowerCase();
      if (ps === "paid" || ps === "succeeded") {
        setLoadErr("This booking is already paid.");
        return;
      }

      const sessionDate = String(b.session_date ?? "");
      const preview: BookingPreview = {
        partner_name: String(b.partner_name ?? "Expert"),
        partner_photo: typeof b.partner_photo === "string" ? b.partner_photo : null,
        partner_profession: typeof b.partner_profession === "string" ? b.partner_profession : null,
        session_date: sessionDate,
        start_time: String(b.start_time ?? ""),
        end_time: String(b.end_time ?? ""),
        total_amount: Number(b.total_amount ?? 0),
        durationMinutes: durationMinutesFromBookingRow(b),
      };
      setBookingPreview(preview);

      const expertUserId = String(b.expert_user_id ?? "");
      const piRes = await fetch("/api/stripe/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expertUserId,
          bookingId: String(b.booking_id ?? bookingId),
        }),
      });
      const piJson = await piRes.json();
      if (cancelled) return;
      if (!piRes.ok) {
        setLoadErr(formatPiError(piJson));
        return;
      }
      const secret = (piJson as { clientSecret?: string }).clientSecret;
      if (!secret) {
        setLoadErr("No client secret from Stripe");
        return;
      }
      setClientSecret(secret);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, bookingId]);

  function handleSuccess() {
    setPaySuccess(true);
    dispatchHeaderBadgesMayHaveChanged();
    onPaid?.();
  }

  function handleClose(next: boolean) {
    if (!next) {
      setClientSecret(null);
      setLoadErr(null);
      setBookingPreview(null);
      setPaySuccess(false);
    }
    onOpenChange(next);
  }

  const showPiSpinner =
    Boolean(bookingPreview) && !clientSecret && !loadErr && Boolean(stripePromise);
  const initials = bookingPreview?.partner_name
    ? bookingPreview.partner_name
        .split(/\s+/)
        .map((n) => n[0] ?? "")
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "EX";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={PAYMENT_CHECKOUT_DIALOG_CONTENT_CLASS}>
        {!paySuccess ? (
          <div className="space-y-5 pr-2">
            <DialogHeader className="space-y-0 text-left">
              <DialogTitle className="text-2xl font-bold tracking-tight text-[#003049]">
                Complete Your Payment
              </DialogTitle>
              <DialogDescription className="sr-only">
                Pay for your scheduled session with card details. Amount matches your booking total.
              </DialogDescription>
            </DialogHeader>

            {bookingPreview ? (
              <>
                <div className="flex gap-3">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[#003049]/15 bg-gray-50">
                    {bookingPreview.partner_photo ? (
                      <Image
                        src={bookingPreview.partner_photo}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="64px"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg font-bold text-[#003049]/35">
                        {initials}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-lg font-bold text-[#003049]">{bookingPreview.partner_name}</p>
                    {bookingPreview.partner_profession ? (
                      <p className="text-sm text-muted-foreground">{bookingPreview.partner_profession}</p>
                    ) : null}
                  </div>
                </div>
                <Separator className="bg-[#003049]/10" />
              </>
            ) : null}

            {bookingPreview ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#003049]">
                  Session Details
                </p>
                <div className="rounded-xl bg-[#003049] px-5 py-4 text-white shadow-md">
                  <div className="space-y-3 text-sm font-bold">
                    <div className="flex gap-3">
                      <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-white/75" aria-hidden />
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">Date</p>
                        <p>{formatLongSessionDate(bookingPreview.session_date)}</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-white/75" aria-hidden />
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">Time</p>
                        <p className="tabular-nums">
                          {formatTimeRange(
                            bookingPreview.session_date,
                            bookingPreview.start_time,
                            bookingPreview.end_time,
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Timer className="mt-0.5 h-4 w-4 shrink-0 text-white/75" aria-hidden />
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">
                          Duration
                        </p>
                        <p>{formatDurationShort(bookingPreview.durationMinutes)}</p>
                      </div>
                    </div>
                  </div>
                  <Separator className="my-4 bg-white/20" />
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-bold">
                      <DollarSign className="h-5 w-5 shrink-0 text-white/90" aria-hidden />
                      <span>Session Total</span>
                    </div>
                    <span className="text-2xl font-bold tabular-nums text-[#F77F00]">
                      ${bookingPreview.total_amount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </>
            ) : null}

            {loadErr ? (
              <p className="text-sm text-destructive">{redactStripeSecrets(loadErr)}</p>
            ) : null}

            {!STRIPE_PUBLISHABLE_KEY || !stripePromise ? (
              <p className="text-sm text-destructive">
                Missing <code className="text-xs">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> in environment.
              </p>
            ) : null}

            {showPiSpinner ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 className="h-10 w-10 animate-spin text-[#F77F00]" aria-hidden />
                <p className="text-center text-sm font-medium text-[#003049]">Setting up payment…</p>
              </div>
            ) : null}

            {clientSecret && stripePromise ? (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: SESSION_PAYMENT_ELEMENTS_APPEARANCE,
                }}
              >
                <SessionPayForm onSuccess={handleSuccess} />
              </Elements>
            ) : null}

            {clientSecret && stripePromise ? (
              <p className="text-center text-xs text-muted-foreground">
                Your payment details are encrypted and processed securely.
              </p>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="h-11 w-full border-2 border-[#F77F00] bg-white font-semibold text-[#003049] hover:bg-[#F77F00]/10"
              onClick={() => handleClose(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <DialogTitle className="text-2xl font-bold text-[#003049]">Payment received</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Your session is paid. You can join from your dashboard when the join window opens.
            </p>
            <Button
              type="button"
              className="w-full bg-[#003049] text-white hover:bg-[#003049]/90"
              onClick={() => handleClose(false)}
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

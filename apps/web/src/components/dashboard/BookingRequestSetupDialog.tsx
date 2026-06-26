"use client";

import { Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { FormEvent, useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";
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
import {
  SESSION_PAYMENT_ELEMENT_OPTIONS,
  SESSION_PAYMENT_ELEMENTS_APPEARANCE,
} from "@/lib/stripe/sessionPaymentElementOptions";
import { sanitizeStripeMessageForUi } from "@/lib/stripe/stripeMessageUi";
import { SessionPaymentMethodBlock } from "@/components/stripe/SessionPaymentMethodBlock";
import { stripePromise } from "@/lib/stripe/loadStripeClient";

function formatApiError(error: unknown): string {
  if (typeof error === "string" && error.trim()) {
    return sanitizeStripeMessageForUi(error, "session_booking");
  }
  return sanitizeStripeMessageForUi("Payment setup failed", "session_booking");
}

function SetupForm({
  bookingId,
  setupIntentId,
  onSuccess,
  setErr,
}: {
  bookingId: string;
  setupIntentId: string | null;
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
    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    });
    if (error) {
      setBusy(false);
      setErr(sanitizeStripeMessageForUi(error.message ?? "Could not save card", "session_booking"));
      return;
    }
    const siId = setupIntent?.id ?? setupIntentId;
    if (!siId) {
      setBusy(false);
      setErr("Setup did not complete");
      return;
    }
    const syncRes = await fetch("/api/stripe/sync-booking-setup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, setupIntentId: siId }),
    });
    const syncJson = (await syncRes.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!syncRes.ok) {
      setErr(formatApiError(syncJson.error));
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
      <SessionPaymentMethodBlock options={SESSION_PAYMENT_ELEMENT_OPTIONS} />
      <Button
        type="submit"
        disabled={!stripe || busy}
        className="w-full bg-convene-hero text-white hover:opacity-95"
      >
        {busy ? "Saving…" : "Save card & send request"}
      </Button>
    </form>
  );
}

export type BookingRequestSetupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string | null;
  expertName: string;
  expertTitle?: string;
  expertPhoto?: string | null;
  expertVisibilityState?: string | null;
  totalUsd?: number | null;
  sessionSummary?: React.ReactNode;
  onCompleted?: () => void;
};

export function BookingRequestSetupDialog({
  open,
  onOpenChange,
  bookingId,
  expertName,
  expertTitle = "",
  expertPhoto = null,
  expertVisibilityState = null,
  totalUsd = null,
  sessionSummary = null,
  onCompleted,
}: BookingRequestSetupDialogProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [setupIntentId, setSetupIntentId] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [paymentTestSkipAvailable, setPaymentTestSkipAvailable] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);

  const initials =
    expertName
      .split(/\s+/)
      .map((n) => n[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "EX";

  useEffect(() => {
    if (!open) {
      setClientSecret(null);
      setSetupIntentId(null);
      setLoadErr(null);
      setPaymentTestSkipAvailable(false);
      setCompleted(false);
      setBusy(false);
      return;
    }
    if (!bookingId) return;

    let cancelled = false;
    (async () => {
      setLoadErr(null);
      setClientSecret(null);
      setSetupIntentId(null);
      setCompleted(false);

      const res = await fetch("/api/stripe/create-booking-setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        clientSecret?: string;
        setupIntentId?: string;
        error?: string;
        dev_bypass?: boolean;
        paymentTestSkipAvailable?: boolean;
      };
      if (cancelled) return;
      if (!res.ok) {
        setLoadErr(formatApiError(data.error));
        return;
      }
      if (data.dev_bypass) {
        setPaymentTestSkipAvailable(true);
        return;
      }
      if (!data.clientSecret) {
        setLoadErr("No setup client secret");
        return;
      }
      setClientSecret(data.clientSecret);
      setSetupIntentId(typeof data.setupIntentId === "string" ? data.setupIntentId : null);
      setPaymentTestSkipAvailable(Boolean(data.paymentTestSkipAvailable));
    })();

    return () => {
      cancelled = true;
    };
  }, [open, bookingId]);

  async function devSkipSave() {
    if (!bookingId) return;
    setBusy(true);
    setLoadErr(null);
    const res = await fetch("/api/stripe/sync-booking-setup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, devSkip: true }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setLoadErr(formatApiError(data.error));
      return;
    }
    setCompleted(true);
    onCompleted?.();
  }

  function handleClose(next: boolean) {
    if (!next) {
      setClientSecret(null);
      setLoadErr(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="z-[210] max-h-[90vh] max-w-lg overflow-y-auto border-border bg-card sm:max-w-md">
        {!completed ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-left text-xl font-bold text-convene-primary">
                Confirm booking request
              </DialogTitle>
              <DialogDescription className="text-left text-sm text-muted-foreground">
                You will only be charged if the expert accepts the booking.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-start gap-3 border-b border-border pb-4">
              <div className="relative h-16 w-16 shrink-0">
                <Avatar className="h-full w-full border border-border">
                  {expertPhoto ? (
                    <AvatarImage src={expertPhoto} alt="" className="object-cover" />
                  ) : null}
                  <AvatarFallback className="bg-muted text-lg font-semibold text-convene-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <VisibleTempDot expertVisibilityState={expertVisibilityState} />
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="text-lg font-semibold text-foreground">{expertName}</p>
                {expertTitle ? <p className="text-sm text-muted-foreground">{expertTitle}</p> : null}
              </div>
            </div>

            {sessionSummary ? (
              <div className="rounded-lg border border-border bg-muted/25 p-4 text-sm">{sessionSummary}</div>
            ) : totalUsd != null ? (
              <div className="rounded-lg border border-border bg-muted/25 p-4 text-sm">
                <div className="flex justify-between gap-4 text-base font-bold text-convene-primary">
                  <span>Total if approved (USD)</span>
                  <span className="tabular-nums">${totalUsd.toFixed(2)}</span>
                </div>
              </div>
            ) : null}

            {loadErr ? <p className="text-sm text-destructive">{loadErr}</p> : null}

            {paymentTestSkipAvailable && !clientSecret ? (
              <Button
                type="button"
                disabled={busy}
                className="w-full bg-convene-hero text-white hover:opacity-95"
                onClick={() => void devSkipSave()}
              >
                {busy ? "Saving…" : "Skip card (dev) & send request"}
              </Button>
            ) : null}

            {clientSecret && stripePromise ? (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: SESSION_PAYMENT_ELEMENTS_APPEARANCE,
                }}
              >
                <SetupForm
                  bookingId={bookingId!}
                  setupIntentId={setupIntentId}
                  onSuccess={() => {
                    setCompleted(true);
                    onCompleted?.();
                  }}
                  setErr={setLoadErr}
                />
              </Elements>
            ) : null}
          </>
        ) : (
          <div className="space-y-4 py-2">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-convene-primary">
              <CheckCircle className="h-6 w-6 shrink-0 text-convene-hero" aria-hidden />
              Request sent
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Your card is saved on file. You&apos;ll only be charged if {expertName.split(/\s+/)[0] || "your expert"}{" "}
              accepts the booking. We&apos;ll notify you when they respond.
            </p>
            <Button type="button" className="w-full bg-convene-primary text-white" onClick={() => handleClose(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  formatPackageDurationLabel,
  packagePurchaseDialogIntro,
} from "@/lib/packages/package-deal";
import { computeSessionCheckoutPricing, roundUsd2 } from "@/lib/sessionCheckoutPricing";
import { VisibleTempDot } from "@/components/presence/VisibleTempDot";
import { SessionPaymentMethodBlock } from "@/components/stripe/SessionPaymentMethodBlock";
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
import { stripePromise } from "@/lib/stripe/loadStripeClient";
import {
  SESSION_PAYMENT_ELEMENT_OPTIONS,
  SESSION_PAYMENT_ELEMENTS_APPEARANCE,
} from "@/lib/stripe/sessionPaymentElementOptions";
import { sanitizeStripeMessageForUi } from "@/lib/stripe/stripeMessageUi";
import { syncSessionPaymentWithServer } from "@/lib/stripe/syncSessionPaymentClient";

export type PackageOfferPreview = {
  package_id: string;
  session_count: number;
  session_duration_minutes: number;
  rate_per_15_min: number;
  package_discount_type: string | null;
  package_discount_value: number | string | null;
  list_usd: number;
  discount_usd: number;
  package_usd: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expertUserId: string;
  expertName: string;
  expertTitle: string;
  expertPhoto: string | null;
  expertVisibilityState?: string | null;
  offer: PackageOfferPreview | null;
  offerLoading?: boolean;
  onRequestSignIn?: () => void;
};

function formatPaymentIntentApiError(error: unknown): string {
  if (typeof error === "string" && error.trim()) {
    return sanitizeStripeMessageForUi(error, "session_booking");
  }
  if (error && typeof error === "object") {
    const o = error as { formErrors?: unknown; fieldErrors?: Record<string, unknown> };
    const fe = o.formErrors;
    if (Array.isArray(fe) && fe.length) {
      return fe.filter((x) => typeof x === "string").join("; ") || "Invalid payment request";
    }
  }
  return sanitizeStripeMessageForUi("Payment setup failed", "session_booking");
}

export function PackagePurchaseDialog({
  open,
  onOpenChange,
  expertUserId,
  expertName,
  expertTitle,
  expertPhoto,
  expertVisibilityState = null,
  offer,
  offerLoading = false,
  onRequestSignIn,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [priceBreakdownOpen, setPriceBreakdownOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [payErr, setPayErr] = useState<string | null>(null);
  const payOpenRef = useRef(false);

  const sessionCount = offer?.session_count ?? 0;
  const sessionDurationMinutes = offer?.session_duration_minutes ?? 0;
  const ratePer15Min = offer?.rate_per_15_min ?? 0;
  const isFixedPrice = offer?.package_discount_type === "fixed_amount";

  const durationLabel = formatPackageDurationLabel(sessionDurationMinutes);
  const blocksPerSession = sessionDurationMinutes > 0 ? sessionDurationMinutes / 15 : 0;
  const totalBlocks = sessionCount > 0 ? sessionCount * blocksPerSession : 0;

  const displayPricing = useMemo(
    () => (offer && offer.package_usd > 0 ? computeSessionCheckoutPricing(offer.package_usd) : null),
    [offer],
  );

  const taxesAndFeesTotal = displayPricing
    ? roundUsd2(displayPricing.platform_fee + displayPricing.taxes_fees)
    : 0;

  const feeLabel = useMemo(() => {
    if (isFixedPrice) return "Package Fee";
    return `Package Fee (${sessionCount} session${sessionCount === 1 ? "" : "s"} × $${ratePer15Min.toFixed(2)} × ${blocksPerSession} ${blocksPerSession === 1 ? "block" : "blocks"})`;
  }, [isFixedPrice, sessionCount, ratePer15Min, blocksPerSession]);

  const feeLineAmount = offer
    ? isFixedPrice
      ? offer.package_usd
      : offer.list_usd
    : 0;

  const initials = useMemo(
    () =>
      expertName
        .split(/\s+/)
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [expertName],
  );

  function resetPaymentState() {
    setPayOpen(false);
    setPaySuccess(false);
    setConfirmationNumber(null);
    setClientSecret(null);
    setPayErr(null);
    payOpenRef.current = false;
  }

  function handlePurchaseDialogOpenChange(next: boolean) {
    if (!next && payOpenRef.current) {
      return;
    }
    if (!next) {
      setErr(null);
      setPriceBreakdownOpen(false);
      resetPaymentState();
    }
    onOpenChange(next);
  }

  function handlePaymentDialogOpenChange(next: boolean) {
    if (!next) {
      resetPaymentState();
      onOpenChange(false);
    } else {
      setPayOpen(true);
      payOpenRef.current = true;
    }
  }

  async function startPurchase() {
    setErr(null);
    if (!offer?.package_id) {
      setErr("This package is not available for purchase yet.");
      return;
    }
    if (!stripePromise) {
      setErr("Payment is not configured.");
      return;
    }

    setBusy(true);
    try {
      const checkoutAttemptId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const piRes = await fetch("/api/stripe/create-package-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: offer.package_id,
          expertUserId,
          checkoutAttemptId,
        }),
      });

      let piJson: { clientSecret?: string; error?: unknown } = {};
      try {
        piJson = (await piRes.json()) as { clientSecret?: string; error?: unknown };
      } catch {
        piJson = {};
      }

      if (!piRes.ok) {
        if (piRes.status === 401) {
          setErr("Sign in to purchase a package.");
          throw new Error("Sign in to purchase a package.");
        }
        setErr(formatPaymentIntentApiError(piJson.error));
        return;
      }

      if (!piJson.clientSecret) {
        setErr("No payment client secret");
        return;
      }

      payOpenRef.current = true;
      flushSync(() => {
        setClientSecret(piJson.clientSecret ?? null);
        setPayErr(null);
        setPaySuccess(false);
        setPayOpen(true);
      });
      onOpenChange(false);
    } catch (e) {
      if (e instanceof Error && e.message === "Sign in to purchase a package.") {
        throw e;
      }
      setErr(e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open && !payOpen} onOpenChange={handlePurchaseDialogOpenChange}>
        <DialogContent className="max-h-[90vh] w-full min-w-0 max-w-lg overflow-x-hidden overflow-y-auto border-border bg-card sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-left text-xl font-bold text-convene-primary">
              Purchase Package with {expertName}
            </DialogTitle>
            {sessionCount > 0 && sessionDurationMinutes > 0 ? (
              <DialogDescription className="text-left text-sm text-foreground">
                {packagePurchaseDialogIntro(sessionCount, sessionDurationMinutes)}
              </DialogDescription>
            ) : null}
          </DialogHeader>

          <div className="space-y-3">
            {err ? <p className="text-sm text-destructive">{err}</p> : null}
            {offerLoading ? (
              <p className="text-sm text-muted-foreground">Loading package pricing…</p>
            ) : null}

            {offer && displayPricing ? (
              <div className="space-y-2 rounded-lg bg-convene-primary px-4 py-3 text-white">
                <p className="font-bold">Package details</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-white/80">Number of sessions</span>
                    <span className="font-medium tabular-nums">{sessionCount}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-white/80">Duration of Each Session</span>
                    <span className="text-right font-medium">{durationLabel}</span>
                  </div>
                </div>
                <Separator className="my-2 bg-white/20" />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="min-w-0 pr-2 text-white/95">{feeLabel}</span>
                    <span className="shrink-0 font-medium tabular-nums">${feeLineAmount.toFixed(2)}</span>
                  </div>
                  {!isFixedPrice && offer.discount_usd > 0 ? (
                    <div className="flex justify-between gap-3 text-convene-hero">
                      <span>Package discount</span>
                      <span className="font-medium tabular-nums">−${offer.discount_usd.toFixed(2)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3">
                    <span>Taxes and Fees</span>
                    <span className="font-medium tabular-nums">${taxesAndFeesTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-white/25 pt-2 text-xl font-bold text-white">
                    <span>Total (in USD)</span>
                    <span className="tabular-nums">${displayPricing.total_amount.toFixed(2)}</span>
                  </div>
                  <button
                    type="button"
                    className="text-left text-xs text-white/85 underline underline-offset-2 hover:text-white"
                    onClick={() => setPriceBreakdownOpen(true)}
                  >
                    Price Breakdown
                  </button>
                </div>
              </div>
            ) : !offerLoading ? (
              <p className="text-sm text-muted-foreground">
                This expert has not finished configuring a purchasable package. Message the expert for help.
              </p>
            ) : null}

            <Button
              type="button"
              className="w-full bg-convene-hero text-white hover:opacity-95"
              disabled={busy || offerLoading || !offer?.package_id}
              onClick={() => {
                if (onRequestSignIn) {
                  onRequestSignIn();
                  return;
                }
                void startPurchase();
              }}
            >
              {busy ? "Working…" : "Purchase Package"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={priceBreakdownOpen} onOpenChange={setPriceBreakdownOpen}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-convene-primary">Price Breakdown</DialogTitle>
          </DialogHeader>
          {offer && displayPricing ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span>Expert Rate per Block</span>
                <span className="tabular-nums">${ratePer15Min.toFixed(2)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Number of Blocks Booked</span>
                <span className="tabular-nums">{totalBlocks}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Booking Fee</span>
                <span className="tabular-nums">${feeLineAmount.toFixed(2)}</span>
              </div>
              {!isFixedPrice && offer.discount_usd > 0 ? (
                <div className="flex justify-between gap-3 text-convene-hero">
                  <span>Package discount</span>
                  <span className="tabular-nums">−${offer.discount_usd.toFixed(2)}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <span>Platform Fee</span>
                <span className="tabular-nums">${displayPricing.platform_fee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Taxes</span>
                <span className="tabular-nums">${displayPricing.taxes_fees.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between gap-3 text-base font-bold text-convene-primary">
                <span>Total (in USD)</span>
                <span className="tabular-nums">${displayPricing.total_amount.toFixed(2)}</span>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={payOpen} onOpenChange={handlePaymentDialogOpenChange}>
        <DialogContent className="z-[210] max-h-[90vh] max-w-lg overflow-y-auto border-border bg-card sm:max-w-md">
          {!paySuccess ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-left text-xl font-bold text-convene-primary">
                  Complete payment
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Enter payment details to purchase a package with {expertName}.
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

              {offer && displayPricing ? (
                <div className="rounded-lg border border-border bg-muted/25 p-4 text-sm">
                  <p className="font-semibold text-convene-primary">Package details</p>
                  <dl className="mt-3 space-y-2 text-foreground">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Number of sessions</dt>
                      <dd className="text-right font-medium tabular-nums">{sessionCount}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Duration of Each Session</dt>
                      <dd className="text-right font-medium">{durationLabel}</dd>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between gap-4 text-base font-bold text-convene-primary">
                      <dt>Total (USD)</dt>
                      <dd className="tabular-nums">${displayPricing.total_amount.toFixed(2)}</dd>
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
                  <PackagePayStep
                    onSuccess={(confirmation) => {
                      setConfirmationNumber(confirmation);
                      setPaySuccess(true);
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
                Package purchased! <span aria-hidden>🎉</span>
              </h2>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p className="text-foreground">
                  Your package with {expertName} is confirmed.
                  {confirmationNumber ? (
                    <>
                      <br />
                      Confirmation Number{" "}
                      <span className="font-mono font-medium text-foreground">{confirmationNumber}</span>
                    </>
                  ) : null}
                </p>
                <p>
                  <span className="font-medium text-foreground">Check your balance:</span> Open{" "}
                  <span className="font-medium text-foreground">Your Dashboard → Booked Sessions</span>. Your
                  package credit balance will appear at the top of that page.
                </p>
                <p>
                  <span className="font-medium text-foreground">How to redeem credits:</span> Visit{" "}
                  {expertName}&apos;s profile, choose an available time slot, and book a session. Your package
                  credit applies automatically at checkout—no card payment needed.
                </p>
              </div>
              <Button asChild className="w-full bg-convene-primary text-white">
                <Link href="/dashboard?view=sessions">Go to Dashboard</Link>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PackagePayStep({
  onSuccess,
  setErr,
}: {
  onSuccess: (confirmationNumber: string | null) => void;
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
      setBusy(false);
      onSuccess(synced.confirmationNumber);
      return;
    }
    setBusy(false);
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

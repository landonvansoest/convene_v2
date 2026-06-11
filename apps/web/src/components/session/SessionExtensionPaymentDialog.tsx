"use client";

import { Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SessionPaymentMethodBlock } from "@/components/stripe/SessionPaymentMethodBlock";
import {
  SESSION_PAYMENT_ELEMENT_OPTIONS,
  SESSION_PAYMENT_ELEMENTS_APPEARANCE,
} from "@/lib/stripe/sessionPaymentElementOptions";
import { sanitizeStripeMessageForUi } from "@/lib/stripe/stripeMessageUi";
import type { SessionCheckoutPricing } from "@/lib/sessionCheckoutPricing";
import { STRIPE_PUBLISHABLE_KEY, stripePromise } from "@/lib/stripe/loadStripeClient";
import { syncSessionPaymentWithServer } from "@/lib/stripe/syncSessionPaymentClient";

function ExtensionPayForm({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
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
      setErr(sanitizeStripeMessageForUi(error.message ?? "Payment failed", "session_extension"));
      return;
    }
    if (paymentIntent?.status === "succeeded" && paymentIntent.id) {
      const synced = await syncSessionPaymentWithServer(paymentIntent.id);
      if ("error" in synced) {
        setBusy(false);
        setErr(sanitizeStripeMessageForUi(synced.error, "session_extension"));
        return;
      }
    }
    setBusy(false);
    if (paymentIntent?.status === "succeeded") {
      onSuccess();
    }
  }

  const ready = stripe && elements;

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-3 pt-1">
      <SessionPaymentMethodBlock options={SESSION_PAYMENT_ELEMENT_OPTIONS} />
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
      <Button type="submit" disabled={!ready || busy} className="h-10 w-full bg-[#F77F00] text-sm font-semibold text-white hover:bg-[#F77F00]/90">
        {busy ? "Processing…" : "Authorize"}
      </Button>
    </form>
  );
}

export type SessionExtensionPaymentPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  /** From GET /api/sessions/:id → live_timing.extension_pricing; must be non-null to open checkout. */
  pricing: SessionCheckoutPricing | null;
  onPaid: () => void;
};

/**
 * Compact extend checkout — designed to sit in a Popover anchored to the Extend button (not a full-screen dialog).
 */
export function SessionExtensionPaymentPanel({
  open,
  onOpenChange,
  bookingId,
  pricing,
  onPaid,
}: SessionExtensionPaymentPanelProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setClientSecret(null);
      setLoadErr(null);
      setAttemptId(null);
      return;
    }
    setAttemptId(crypto.randomUUID());
  }, [open]);

  useEffect(() => {
    if (!open || !attemptId || !pricing) return;
    let cancelled = false;

    const run = async () => {
      setLoadErr(null);
      setClientSecret(null);
      const piRes = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}/create-extension-payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extensionAttemptId: attemptId }),
      });
      const piJson = (await piRes.json()) as { clientSecret?: string; error?: string };
      if (cancelled) return;
      if (!piRes.ok) {
        setLoadErr(typeof piJson.error === "string" ? piJson.error : "Could not start payment");
        return;
      }
      const secret = piJson.clientSecret;
      if (!secret) {
        setLoadErr("No client secret from Stripe");
        return;
      }
      setClientSecret(secret);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [open, attemptId, bookingId, pricing]);

  const totalFormatted = pricing ? pricing.total_amount.toFixed(2) : "";

  return (
    <div className="space-y-3 p-1">
      <div className="space-y-1">
        <h3 className="text-base font-bold leading-tight text-[#003049]">Extend Session (+15 minutes)</h3>
        <p className="text-xs leading-snug text-[#003049]/70">Fee based on Expert&apos;s rate (plus fees).</p>
        {pricing ? (
          <p className="text-sm font-semibold text-[#003049]">
            Total Due:{" "}
            <span className="tabular-nums text-[#F77F00]">${totalFormatted}</span>
          </p>
        ) : null}
      </div>

      {loadErr ? <p className="text-xs text-destructive">{loadErr}</p> : null}

      {!STRIPE_PUBLISHABLE_KEY || !stripePromise ? (
        <p className="text-xs text-destructive">
          Missing <code className="font-mono text-[10px]">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>.
        </p>
      ) : null}

      {open && pricing && !clientSecret && !loadErr && stripePromise ? (
        <div className="flex items-center gap-2 py-2 text-sm text-[#003049]/80">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#F77F00]" aria-hidden />
          <span>Setting up…</span>
        </div>
      ) : null}

      {clientSecret && stripePromise && attemptId ? (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: SESSION_PAYMENT_ELEMENTS_APPEARANCE,
          }}
        >
          <ExtensionPayForm
            onSuccess={() => {
              onPaid();
              onOpenChange(false);
            }}
          />
        </Elements>
      ) : null}
    </div>
  );
}

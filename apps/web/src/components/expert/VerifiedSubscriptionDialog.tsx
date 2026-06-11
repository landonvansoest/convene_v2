"use client";

import { Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SessionPaymentMethodBlock } from "@/components/stripe/SessionPaymentMethodBlock";
import { PAYMENT_CHECKOUT_DIALOG_CONTENT_CLASS } from "@/components/stripe/checkoutDialogStyles";
import {
  SESSION_PAYMENT_ELEMENT_OPTIONS,
  VERIFIED_SUBSCRIPTION_ELEMENTS_APPEARANCE,
} from "@/lib/stripe/sessionPaymentElementOptions";
import { STRIPE_PUBLISHABLE_KEY, stripePromise } from "@/lib/stripe/loadStripeClient";

function redactStripeSecrets(message: string): string {
  return message.replace(/sk_(?:test|live)_[^\s]+/gi, "sk_…");
}

function PayForm({ onSuccess }: { onSuccess: () => void }) {
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
      setErr(redactStripeSecrets(error.message ?? "Payment failed"));
      return;
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
        {busy ? "Processing…" : "Subscribe & pay"}
      </Button>
    </form>
  );
}

export type VerifiedSubscriptionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

/**
 * In-app subscription checkout (Payment Element), matching session booking payment UX — no full-page redirect.
 */
export function VerifiedSubscriptionDialog({ open, onOpenChange, onSuccess }: VerifiedSubscriptionDialogProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) {
      setClientSecret(null);
      setLoadErr(null);
      setDone(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadErr(null);
      setClientSecret(null);
      setDone(false);
      const res = await fetch("/api/stripe/create-subscription-payment-intent", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { clientSecret?: string; error?: string };
      if (cancelled) return;
      if (!res.ok) {
        setLoadErr(typeof json.error === "string" ? json.error : "Could not start payment");
        return;
      }
      if (!json.clientSecret) {
        setLoadErr("No client secret from server");
        return;
      }
      setClientSecret(json.clientSecret);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function handleClose(next: boolean) {
    if (!next) {
      setClientSecret(null);
      setLoadErr(null);
      setDone(false);
    }
    onOpenChange(next);
  }

  const showLoader = open && !clientSecret && !loadErr && Boolean(stripePromise);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={PAYMENT_CHECKOUT_DIALOG_CONTENT_CLASS}>
        {!done ? (
          <div className="space-y-5 pr-2">
            <DialogHeader className="space-y-0 text-left">
              <DialogTitle className="text-2xl font-bold tracking-tight text-[#003049]">Complete your subscription</DialogTitle>
              <DialogDescription className="sr-only">
                Pay for the Verified plan with card, PayPal, or Cash App. Same options as session checkout.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl bg-[#003049] px-5 py-4 text-center text-sm font-bold text-white shadow-md">
              <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">Subscription</p>
              <p className="mt-1 text-2xl tabular-nums text-[#F77F00]">$15.00 / month</p>
            </div>

            {loadErr ? <p className="text-sm text-destructive">{redactStripeSecrets(loadErr)}</p> : null}
            {!STRIPE_PUBLISHABLE_KEY || !stripePromise ? (
              <p className="text-sm text-destructive">
                Missing <code className="text-xs">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> in environment.
              </p>
            ) : null}

            {showLoader ? (
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
                  appearance: VERIFIED_SUBSCRIPTION_ELEMENTS_APPEARANCE,
                }}
              >
                <PayForm
                  onSuccess={() => {
                    setDone(true);
                    onSuccess?.();
                  }}
                />
              </Elements>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <DialogTitle className="text-2xl font-bold text-[#003049]">You&apos;re subscribed</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Your Verified subscription is processing. The app updates within a few seconds after your payment
              is confirmed.
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

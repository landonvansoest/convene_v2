"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
const stripePromise = pk ? loadStripe(pk) : null;

function PayForm({ returnPath }: { returnPath: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setErr(null);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${origin}${returnPath}`,
      },
    });
    setBusy(false);
    if (error) setErr(error.message ?? "Payment failed");
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
      <PaymentElement />
      {err ? <p className="text-sm text-red-300">{err}</p> : null}
      <button
        type="submit"
        disabled={!stripe || busy}
        className="w-full rounded-md bg-[var(--convene-hero)] py-2.5 font-medium text-[var(--convene-primary)] disabled:opacity-60"
      >
        {busy ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}

function formatPiError(data: unknown): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const e = (data as { error?: unknown }).error;
    if (typeof e === "string") return e;
    if (typeof e === "object" && e !== null && "message" in e) {
      const m = (e as { message?: unknown }).message;
      if (typeof m === "string") return m;
    }
  }
  return "Payment setup failed";
}

export default function FreelancePayPage() {
  const params = useParams();
  const freelanceId = typeof params.id === "string" ? params.id : "";

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    if (!freelanceId) return;
    let cancelled = false;
    (async () => {
      setLoadErr(null);
      setClientSecret(null);
      const fRes = await fetch(`/api/freelance/${encodeURIComponent(freelanceId)}`);
      const fJson = (await fRes.json()) as Record<string, unknown>;
      if (cancelled) return;
      if (!fRes.ok) {
        setLoadErr(typeof fJson.error === "string" ? fJson.error : "Failed to load");
        return;
      }
      const f = fJson.freelance as Record<string, unknown> | undefined;
      if (!f) {
        setLoadErr("Invalid response");
        return;
      }
      if (f.user_role !== "learner") {
        setLoadErr("Only the learner can pay for this work.");
        return;
      }
      if (f.status !== "approved") {
        setLoadErr("This offer must be approved before payment.");
        return;
      }
      const ps = String(f.payment_status ?? "").toLowerCase();
      if (ps === "paid" || ps === "succeeded") {
        setLoadErr("Already paid.");
        return;
      }
      const total = Number(f.total_price);
      if (total <= 0) {
        setLoadErr("Nothing to pay (total is zero).");
        return;
      }
      setLabel(`$${total.toFixed(2)} · ${String(f.description_of_work ?? "").slice(0, 80)}`);

      const amountCents = Math.round(total * 100);
      const piRes = await fetch("/api/stripe/create-freelance-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freelanceId,
          amount: amountCents,
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
  }, [freelanceId]);

  if (!pk || !stripePromise) {
    return (
      <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
        <p className="text-sm text-red-300">
          Missing <code className="text-white/90">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> in env.
        </p>
        <Link href="/freelance" className="mt-4 inline-block text-[var(--convene-hero)] underline">
          Back to freelance
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
      <div className="mx-auto max-w-md">
        <Link href="/freelance" className="text-sm text-[var(--convene-hero)] underline">
          ← Freelance
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Pay for freelance work</h1>
        {label ? <p className="mt-2 text-sm text-white/75">{label}</p> : null}
        {loadErr ? <p className="mt-4 text-sm text-red-300">{loadErr}</p> : null}
        {clientSecret ? (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: "night", variables: { colorPrimary: "#c9a227" } },
            }}
          >
            <PayForm returnPath="/freelance" />
          </Elements>
        ) : !loadErr ? (
          <p className="mt-6 text-sm text-white/60">Preparing checkout…</p>
        ) : null}
      </div>
    </div>
  );
}

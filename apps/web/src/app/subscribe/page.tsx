"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function SubscribeInner() {
  const search = useSearchParams();
  const success = search.get("success");
  const canceled = search.get("canceled");

  const [priceId, setPriceId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startCheckout() {
    setBusy(true);
    setErr(null);
    const body =
      priceId.trim().length > 0 ? JSON.stringify({ priceId: priceId.trim() }) : JSON.stringify({});
    const res = await fetch("/api/stripe/create-subscription-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const data = (await res.json()) as { url?: string; error?: string };
    setBusy(false);
    if (!res.ok) {
      setErr(data.error ?? "Could not start checkout");
      return;
    }
    if (data.url) {
      window.location.href = data.url;
    }
  }

  return (
    <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
      <div className="mx-auto max-w-lg">
        <p className="text-sm uppercase tracking-widest text-[var(--convene-hero)] mb-2">
          Membership
        </p>
        <h1 className="text-2xl font-semibold">Subscribe</h1>
        <p className="mt-2 text-sm text-white/75">
          Opens Stripe Checkout (subscription). Your user id is stored on the subscription as{" "}
          <code className="text-white/90">metadata.user_id</code> for webhook sync into{" "}
          <code className="text-white/90">user_subscriptions</code>.
        </p>
        {success ? (
          <p className="mt-4 text-sm text-emerald-300">
            Payment succeeded — webhooks may take a few seconds.{" "}
            <Link href="/account" className="underline text-[var(--convene-hero)]">
              View account & billing
            </Link>
            .
          </p>
        ) : null}
        {canceled ? (
          <p className="mt-4 text-sm text-amber-200">Checkout was canceled.</p>
        ) : null}
        {err ? (
          <p className="mt-4 text-sm text-red-300">
            {err}{" "}
            {err.includes("Unauthorized") ? (
              <Link href="/login" className="underline text-[var(--convene-hero)]">
                Sign in
              </Link>
            ) : null}
          </p>
        ) : null}
        <label className="mt-8 block">
          <span className="text-xs text-white/80">
            Optional: Stripe Price id (overrides <code className="text-white/70">STRIPE_SUBSCRIPTION_PRICE_ID</code>)
          </span>
          <input
            className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 font-mono text-sm outline-none focus:border-[var(--convene-hero)]"
            value={priceId}
            onChange={(e) => setPriceId(e.target.value)}
            placeholder="price_..."
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void startCheckout()}
          className="mt-6 w-full rounded-md bg-[var(--convene-hero)] py-2.5 font-medium text-[var(--convene-primary)] disabled:opacity-60"
        >
          {busy ? "Redirecting…" : "Continue to Stripe Checkout"}
        </button>
        <p className="mt-6 text-xs text-white/45">
          Add <code className="text-white/70">checkout.session.completed</code> to your Stripe webhook
          endpoint if it is not already enabled.
        </p>
      </div>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
          <p className="text-sm text-white/60">Loading…</p>
        </div>
      }
    >
      <SubscribeInner />
    </Suspense>
  );
}

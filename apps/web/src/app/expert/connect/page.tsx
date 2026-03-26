"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ExpertConnectInner() {
  const search = useSearchParams();
  const complete = search.get("complete");
  const refresh = search.get("refresh");

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startOnboarding() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/stripe/connect/onboard", { method: "POST" });
    const data = (await res.json()) as { url?: string; error?: string };
    setBusy(false);
    if (!res.ok) {
      setErr(data.error ?? "Could not start Stripe Connect");
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
          Expert
        </p>
        <h1 className="text-2xl font-semibold">Stripe payouts</h1>
        <p className="mt-2 text-sm text-white/75">
          Connect a Stripe Express account to receive session payouts. You need an expert profile first (
          <Link href="/become-expert" className="text-[var(--convene-hero)] underline">
            become an expert
          </Link>
          ).
        </p>
        {complete ? (
          <p className="mt-4 text-sm text-emerald-300">
            Stripe sent you back here — if onboarding finished, you can return to availability or sessions.
          </p>
        ) : null}
        {refresh ? (
          <p className="mt-4 text-sm text-amber-200">
            Link expired; start onboarding again below.
          </p>
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
        <button
          type="button"
          disabled={busy}
          onClick={() => void startOnboarding()}
          className="mt-8 w-full rounded-md bg-[var(--convene-hero)] py-2.5 font-medium text-[var(--convene-primary)] disabled:opacity-60"
        >
          {busy ? "Opening Stripe…" : "Start Stripe Connect onboarding"}
        </button>
        <p className="mt-6 text-xs text-white/45">
          Return URL uses <code className="text-white/70">NEXT_PUBLIC_APP_URL</code>.
        </p>
      </div>
    </div>
  );
}

export default function ExpertConnectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
          <p className="text-sm text-white/60">Loading…</p>
        </div>
      }
    >
      <ExpertConnectInner />
    </Suspense>
  );
}

"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function SessionReviewLearnerPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = typeof params.bookingId === "string" ? params.bookingId : "";

  const [overall, setOverall] = useState("5");
  const [publicReview, setPublicReview] = useState("");
  const [privateMsg, setPrivateMsg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}/reviews/learner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        overall_rating: Number(overall),
        public_review: publicReview.trim() || null,
        private_message: privateMsg.trim() || null,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Failed");
      return;
    }
    router.push("/sessions");
  }

  return (
    <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
      <div className="mx-auto max-w-md">
        <Link href="/sessions" className="text-sm text-[var(--convene-hero)] underline">
          ← Sessions
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Review learner</h1>
        <p className="mt-2 text-sm text-white/75">For completed sessions only. One review per booking.</p>
        {err ? <p className="mt-4 text-sm text-red-300">{err}</p> : null}
        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-xs text-white/80">Overall (1–5)</span>
            <select
              className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
              value={overall}
              onChange={(e) => setOverall(e.target.value)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-white/80">Public review</span>
            <textarea
              rows={4}
              className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
              value={publicReview}
              onChange={(e) => setPublicReview(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs text-white/80">Private note (optional)</span>
            <textarea
              rows={2}
              className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
              value={privateMsg}
              onChange={(e) => setPrivateMsg(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-[var(--convene-hero)] py-2.5 font-medium text-[var(--convene-primary)] disabled:opacity-60"
          >
            {busy ? "Submitting…" : "Submit review"}
          </button>
        </form>
      </div>
    </div>
  );
}

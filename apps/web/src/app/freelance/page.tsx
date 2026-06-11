"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  FREELANCE_STATUS_LABEL,
  type FreelanceStatus,
} from "@/lib/freelance/transitions";

type Item = Record<string, unknown> & {
  freelance_id: string;
  status: FreelanceStatus;
  expert_user_id: string;
  learner_user_id: string;
  total_price: number;
  description_of_work: string | null;
  payment_status?: string;
  work_deadline?: string | null;
  expert_grace_end_at?: string | null;
  completion_submitted_at?: string | null;
  learner_completion_deadline_at?: string | null;
  rectification_deadline_at?: string | null;
  admin_review_reason?: string | null;
  completion_message?: string | null;
  user_role: "learner" | "expert";
};

type ActionKey =
  | "accept"
  | "decline"
  | "reoffer"
  | "submit_completion"
  | "accept_completion"
  | "decline_completion";

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function FreelancePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [learnerId, setLearnerId] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("500");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/freelance");
    const data = await res.json();
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Failed");
      setItems([]);
      return;
    }
    setErr(null);
    setItems((data.items as Item[]) ?? []);
  }, []);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      await refresh();
      if (!c) setLoading(false);
    })();
    return () => {
      c = true;
    };
  }, [refresh]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/freelance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        learnerUserId: learnerId.trim(),
        descriptionOfWork: desc.trim(),
        totalPrice: Number(price),
        deadline: deadline.trim() || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      window.alert(typeof data.error === "string" ? data.error : "Failed");
      return;
    }
    setDesc("");
    setDeadline("");
    await refresh();
  }

  async function callAction(
    fid: string,
    action: ActionKey,
    extra: Record<string, unknown> = {},
  ) {
    const res = await fetch(`/api/freelance/${encodeURIComponent(fid)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) {
      window.alert(typeof data.error === "string" ? data.error : "Failed");
      return;
    }
    await refresh();
  }

  return (
    <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm uppercase tracking-widest text-[var(--convene-hero)] mb-2">Work</p>
        <h1 className="text-2xl font-semibold">Freelance</h1>
        <p className="mt-2 text-sm text-white/75">
          Lifecycle: offered → learner accepts & pays → in&nbsp;progress → expert submits completion →
          learner accepts (or 3-day silence auto-releases payout). Missed deadlines and declined
          completions escalate to admin review.
        </p>
        {err ? (
          <p className="mt-4 text-sm text-red-300">
            {err}{" "}
            <Link href="/login" className="underline text-[var(--convene-hero)]">
              Sign in
            </Link>
          </p>
        ) : null}

        <section className="mt-10 rounded-xl border border-white/15 bg-white/5 p-5">
          <h2 className="font-medium text-[var(--convene-hero)]">New offer (expert)</h2>
          <form onSubmit={(e) => void onCreate(e)} className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs text-white/80">Learner user id</span>
              <input
                required
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 font-mono text-sm outline-none focus:border-[var(--convene-hero)]"
                value={learnerId}
                onChange={(e) => setLearnerId(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/80">Description</span>
              <textarea
                required
                rows={3}
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/80">Total price (USD)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/80">Work deadline (when you&apos;ll deliver)</span>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-[var(--convene-hero)] px-4 py-2 text-sm font-medium text-[var(--convene-primary)] disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create offer"}
            </button>
          </form>
        </section>

        <section className="mt-10">
          <h2 className="font-medium text-[var(--convene-hero)]">Your items</h2>
          {loading ? (
            <p className="mt-4 text-sm text-white/60">Loading…</p>
          ) : items.length === 0 ? (
            <p className="mt-4 text-sm text-white/60">None yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {items.map((f) => (
                <li
                  key={f.freelance_id}
                  className="rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[var(--convene-hero)]/20 px-2 py-0.5 text-xs font-medium text-[var(--convene-hero)]">
                      {FREELANCE_STATUS_LABEL[f.status] ?? f.status}
                    </span>
                    <span className="text-xs text-white/45">
                      you are the {f.user_role} · ${Number(f.total_price).toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1 text-white/65">{f.description_of_work}</p>
                  <p className="mt-1 text-xs text-white/45">
                    payment: {String(f.payment_status ?? "pending")}
                    {f.work_deadline ? ` · deadline ${fmtDate(f.work_deadline)}` : ""}
                  </p>
                  {f.status === "completion_submitted" && f.learner_completion_deadline_at ? (
                    <p className="mt-1 text-xs text-white/55">
                      Auto-releases on {fmtDate(f.learner_completion_deadline_at)} if no learner
                      response.
                    </p>
                  ) : null}
                  {f.status === "admin_review" ? (
                    <p className="mt-1 text-xs text-white/55">
                      {f.admin_review_reason ?? "Under admin review"}
                      {f.rectification_deadline_at
                        ? ` · rectification due ${fmtDate(f.rectification_deadline_at)}`
                        : ""}
                    </p>
                  ) : null}
                  {f.completion_message ? (
                    <p className="mt-1 text-xs text-white/55">
                      Expert note: {f.completion_message}
                    </p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {/* learner: offered → accept (then pay) or decline */}
                    {f.status === "offered" && f.user_role === "learner" ? (
                      <>
                        <Link
                          href={`/freelance/${encodeURIComponent(f.freelance_id)}/pay`}
                          className="text-[var(--convene-hero)] underline"
                        >
                          Accept & pay
                        </Link>
                        <button
                          type="button"
                          className="text-white/60 underline"
                          onClick={() => {
                            const reason = window.prompt("Optional reason for declining:");
                            if (reason === null) return;
                            void callAction(f.freelance_id, "decline", { reason: reason || null });
                          }}
                        >
                          Decline
                        </button>
                      </>
                    ) : null}

                    {/* learner: accepted_pending_payment → finish payment */}
                    {f.status === "accepted_pending_payment" && f.user_role === "learner" ? (
                      <Link
                        href={`/freelance/${encodeURIComponent(f.freelance_id)}/pay`}
                        className="text-[var(--convene-hero)] underline"
                      >
                        Complete payment
                      </Link>
                    ) : null}

                    {/* expert: declined → reoffer (revise) */}
                    {f.status === "declined" && f.user_role === "expert" ? (
                      <button
                        type="button"
                        className="text-[var(--convene-hero)] underline"
                        onClick={() => void callAction(f.freelance_id, "reoffer")}
                      >
                        Re-send offer
                      </button>
                    ) : null}

                    {/* expert: paid_in_progress → submit completion */}
                    {f.status === "paid_in_progress" && f.user_role === "expert" ? (
                      <button
                        type="button"
                        className="text-[var(--convene-hero)] underline"
                        onClick={() => {
                          const msg = window.prompt("Optional note to the learner:");
                          if (msg === null) return;
                          void callAction(f.freelance_id, "submit_completion", {
                            completionMessage: msg || null,
                          });
                        }}
                      >
                        Submit completion
                      </button>
                    ) : null}

                    {/* learner: completion_submitted → accept | decline */}
                    {f.status === "completion_submitted" && f.user_role === "learner" ? (
                      <>
                        <button
                          type="button"
                          className="text-[var(--convene-hero)] underline"
                          onClick={() => void callAction(f.freelance_id, "accept_completion")}
                        >
                          Accept completion
                        </button>
                        <button
                          type="button"
                          className="text-white/60 underline"
                          onClick={() => {
                            const reason = window.prompt("What's the problem? (sent to admin)");
                            if (reason === null) return;
                            void callAction(f.freelance_id, "decline_completion", {
                              reason: reason || null,
                            });
                          }}
                        >
                          Decline completion
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

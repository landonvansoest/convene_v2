"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Item = Record<string, unknown> & {
  freelance_id: string;
  status: string;
  expert_user_id: string;
  learner_user_id: string;
  total_price: number;
  description_of_work: string | null;
  payment_status?: string;
  user_role: "learner" | "expert";
};

export default function FreelancePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [learnerId, setLearnerId] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("500");
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
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      window.alert(typeof data.error === "string" ? data.error : "Failed");
      return;
    }
    setDesc("");
    await refresh();
  }

  async function patchStatus(fid: string, status: "approved" | "complete") {
    const res = await fetch(`/api/freelance/${encodeURIComponent(fid)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
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
          Experts offer work to a learner: offered → learner approves → learner pays (when total is not zero) →
          expert marks complete.
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
                <li key={f.freelance_id} className="rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-sm">
                  <div className="font-medium capitalize">{f.status}</div>
                  <p className="mt-1 text-white/65">{f.description_of_work}</p>
                  <p className="mt-1 text-xs text-white/45">
                    You are the <span className="text-white/70">{f.user_role}</span> · $
                    {Number(f.total_price).toFixed(2)} · payment:{" "}
                    {String(f.payment_status ?? "pending")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {f.status === "offered" && f.user_role === "learner" ? (
                      <button
                        type="button"
                        className="text-[var(--convene-hero)] underline"
                        onClick={() => void patchStatus(f.freelance_id, "approved")}
                      >
                        Approve (learner)
                      </button>
                    ) : null}
                    {f.status === "approved" &&
                    f.user_role === "learner" &&
                    Number(f.total_price) > 0 &&
                    !["paid", "succeeded"].includes(String(f.payment_status ?? "").toLowerCase()) ? (
                      <Link
                        href={`/freelance/${encodeURIComponent(f.freelance_id)}/pay`}
                        className="text-[var(--convene-hero)] underline"
                      >
                        Pay now
                      </Link>
                    ) : null}
                    {f.status === "approved" && f.user_role === "expert" ? (
                      Number(f.total_price) > 0 &&
                      !["paid", "succeeded"].includes(String(f.payment_status ?? "").toLowerCase()) ? (
                        <span className="text-white/45">Waiting for learner payment.</span>
                      ) : (
                        <button
                          type="button"
                          className="text-[var(--convene-hero)] underline"
                          onClick={() => void patchStatus(f.freelance_id, "complete")}
                        >
                          Mark complete (expert)
                        </button>
                      )
                    ) : null}
                    {f.status === "approved" &&
                    f.user_role === "learner" &&
                    Number(f.total_price) <= 0 ? (
                      <span className="text-white/45">No payment required — expert can complete.</span>
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

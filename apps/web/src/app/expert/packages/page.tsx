"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Pkg = Record<string, unknown> & {
  package_id: string;
  title: string;
  is_published: boolean;
  status: string;
};

export default function ExpertPackagesManagePage() {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Coaching bundle");
  const [description, setDescription] = useState("");
  const [sessionCount, setSessionCount] = useState("3");
  const [durationMin, setDurationMin] = useState("60");
  const [priceDollars, setPriceDollars] = useState("299");
  const [publish, setPublish] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/expert-packages");
    const data = await res.json();
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Failed to load");
      setPackages([]);
      return;
    }
    setErr(null);
    setPackages((data.packages as Pkg[]) ?? []);
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
    setErr(null);
    const price_cents = Math.round(Number(priceDollars) * 100);
    const res = await fetch("/api/expert-packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description.trim() || null,
        session_count: Number(sessionCount),
        session_duration_minutes: Number(durationMin),
        price_cents: publish ? price_cents : null,
        is_published: publish,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Create failed");
      return;
    }
    await refresh();
  }

  async function togglePublish(p: Pkg) {
    const res = await fetch(`/api/expert-packages/${encodeURIComponent(p.package_id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_published: !p.is_published }),
    });
    const data = await res.json();
    if (!res.ok) {
      window.alert(typeof data.error === "string" ? data.error : "Update failed");
      return;
    }
    await refresh();
  }

  return (
    <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
      <div className="mx-auto max-w-xl">
        <p className="text-sm uppercase tracking-widest text-[var(--convene-hero)] mb-2">Expert</p>
        <h1 className="text-2xl font-semibold">Session packages</h1>
        <p className="mt-2 text-sm text-white/75">
          Published packages appear on your{" "}
          <Link href="/experts" className="text-[var(--convene-hero)] underline">
            expert profile
          </Link>
          .
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
          <h2 className="font-medium text-[var(--convene-hero)]">New package</h2>
          <form onSubmit={(e) => void onCreate(e)} className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs text-white/80">Title</span>
              <input
                required
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/80">Description</span>
              <textarea
                rows={3}
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-white/80">Sessions</span>
                <input
                  type="number"
                  min={1}
                  required
                  className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                  value={sessionCount}
                  onChange={(e) => setSessionCount(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs text-white/80">Minutes each</span>
                <input
                  type="number"
                  min={1}
                  required
                  className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs text-white/80">Price USD (if publishing)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              Publish
            </label>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md bg-[var(--convene-hero)] py-2.5 font-medium text-[var(--convene-primary)] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Create package"}
            </button>
          </form>
        </section>

        <section className="mt-10">
          <h2 className="font-medium text-[var(--convene-hero)]">Your packages</h2>
          {loading ? (
            <p className="mt-4 text-sm text-white/60">Loading…</p>
          ) : packages.length === 0 ? (
            <p className="mt-4 text-sm text-white/60">None yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {packages.map((p) => (
                <li
                  key={p.package_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-sm"
                >
                  <span>
                    {String(p.title)} · {String(p.status)} · pub: {p.is_published ? "yes" : "no"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void togglePublish(p)}
                    className="text-xs text-[var(--convene-hero)] underline"
                  >
                    Toggle publish
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

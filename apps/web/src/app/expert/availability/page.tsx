"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

function parseMinutesFromBookingCol(v: unknown): string {
  if (v == null || v === "") return "";
  const s = String(v);
  const m1 = s.match(/^(\d+)\s*minutes?$/i);
  if (m1) return m1[1];
  const m2 = s.match(/^(\d+):(\d{2}):(\d{2})/);
  if (m2) {
    const h = parseInt(m2[1], 10);
    const mi = parseInt(m2[2], 10);
    return String(h * 60 + mi);
  }
  return "";
}

function isoDateOnly(v: unknown): string {
  if (!v) return "";
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : "";
}

export default function ExpertAvailabilityPage() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ratePer15, setRatePer15] = useState("25");
  const [minDuration, setMinDuration] = useState("30");
  const [maxDuration, setMaxDuration] = useState("120");
  const [weeklyJson, setWeeklyJson] = useState("{}");
  const [discEnabled, setDiscEnabled] = useState(false);
  const [discType, setDiscType] = useState<"percent" | "fixed_amount">("percent");
  const [discValue, setDiscValue] = useState("10");
  const [discMaxMin, setDiscMaxMin] = useState("");
  const [discEffFrom, setDiscEffFrom] = useState("");
  const [discEffUntil, setDiscEffUntil] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/experts/availability");
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as { availability?: Record<string, unknown> | null };
      if (cancelled) return;
      const a = j.availability;
      if (!a) return;
      if (a.rate != null) setRatePer15(String(a.rate));
      const min = parseMinutesFromBookingCol(a.minimum_booking);
      if (min) setMinDuration(min);
      const max = parseMinutesFromBookingCol(a.maximum_booking);
      if (max) setMaxDuration(max);
      try {
        setWeeklyJson(JSON.stringify(a.weekly_schedule ?? {}, null, 2));
      } catch {
        setWeeklyJson("{}");
      }
      setDiscEnabled(Boolean(a.first_session_discount_enabled));
      const dt = a.first_session_discount_type;
      if (dt === "fixed_amount" || dt === "percent") setDiscType(dt);
      if (a.first_session_discount_value != null) {
        setDiscValue(String(a.first_session_discount_value));
      }
      if (a.first_session_discount_max_session_minutes != null) {
        setDiscMaxMin(String(a.first_session_discount_max_session_minutes));
      }
      setDiscEffFrom(isoDateOnly(a.first_session_discount_effective_from));
      setDiscEffUntil(isoDateOnly(a.first_session_discount_effective_until));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setOk(null);
    let weeklySchedule: Record<string, unknown> = {};
    try {
      weeklySchedule = JSON.parse(weeklyJson || "{}") as Record<string, unknown>;
    } catch {
      setError("Weekly schedule must be valid JSON (e.g. {}).");
      setSaving(false);
      return;
    }
    const res = await fetch("/api/experts/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ratePer15Min: Number(ratePer15),
        minDuration: minDuration ? Number(minDuration) : undefined,
        maxDuration: maxDuration ? Number(maxDuration) : undefined,
        weeklySchedule,
        dateOverrides: [],
        firstSessionDiscountEnabled: discEnabled,
        firstSessionDiscountType: discEnabled ? discType : null,
        firstSessionDiscountValue: discEnabled ? Number(discValue) : null,
        firstSessionDiscountMaxSessionMinutes: discMaxMin.trim()
          ? Number(discMaxMin)
          : null,
        firstSessionDiscountEffectiveFrom: discEffFrom.trim() || null,
        firstSessionDiscountEffectiveUntil: discEffUntil.trim() || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Save failed");
      return;
    }
    setOk(data.message ?? "Saved.");
  }

  return (
    <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
      <div className="mx-auto max-w-xl">
        <p className="text-sm uppercase tracking-widest text-[var(--convene-hero)] mb-2">
          Expert
        </p>
        <h1 className="text-2xl font-semibold">Availability & rate (per 15 min)</h1>
        <p className="mt-2 text-sm text-white/75">
          Sets <code className="text-white/90">expert_availability</code> for your account. Requires an expert profile.
        </p>
        {error ? (
          <p className="mt-4 text-sm text-red-300">
            {error}{" "}
            {error.includes("Unauthorized") ? (
              <Link href="/login" className="underline text-[var(--convene-hero)]">
                Sign in
              </Link>
            ) : null}
          </p>
        ) : null}
        {ok ? <p className="mt-4 text-sm text-emerald-300">{ok}</p> : null}
        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm text-white/90">Rate (USD per 15 minutes)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              required
              className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
              value={ratePer15}
              onChange={(e) => setRatePer15(e.target.value)}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm text-white/90">Min session (minutes)</span>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                value={minDuration}
                onChange={(e) => setMinDuration(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm text-white/90">Max session (minutes)</span>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                value={maxDuration}
                onChange={(e) => setMaxDuration(e.target.value)}
              />
            </label>
          </div>
          <div className="rounded-lg border border-white/15 bg-black/20 p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={discEnabled}
                onChange={(e) => setDiscEnabled(e.target.checked)}
                className="rounded border-white/40"
              />
              <span className="text-white/90">First-session discount (learner’s first paid session with you)</span>
            </label>
            {discEnabled ? (
              <div className="grid gap-3 sm:grid-cols-2 pl-6">
                <label className="block sm:col-span-2">
                  <span className="text-xs text-white/80">Type</span>
                  <select
                    className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none"
                    value={discType}
                    onChange={(e) =>
                      setDiscType(e.target.value === "fixed_amount" ? "fixed_amount" : "percent")
                    }
                  >
                    <option value="percent">Percent off list price</option>
                    <option value="fixed_amount">Fixed amount off (USD)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-white/80">
                    {discType === "percent" ? "Percent off" : "Amount off (USD)"}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={discType === "percent" ? "1" : "0.01"}
                    required={discEnabled}
                    className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none"
                    value={discValue}
                    onChange={(e) => setDiscValue(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-white/80">Max session length (minutes, optional)</span>
                  <input
                    type="number"
                    min={1}
                    placeholder="e.g. 60"
                    className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none"
                    value={discMaxMin}
                    onChange={(e) => setDiscMaxMin(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-white/80">Effective from (date, optional)</span>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none"
                    value={discEffFrom}
                    onChange={(e) => setDiscEffFrom(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-white/80">Effective until (date, optional)</span>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none"
                    value={discEffUntil}
                    onChange={(e) => setDiscEffUntil(e.target.value)}
                  />
                </label>
              </div>
            ) : null}
          </div>
          <label className="block">
            <span className="text-sm text-white/90">Weekly schedule (JSON)</span>
            <textarea
              rows={6}
              className="mt-1 w-full font-mono text-sm rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
              value={weeklyJson}
              onChange={(e) => setWeeklyJson(e.target.value)}
              placeholder='{}'
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-md bg-[var(--convene-hero)] py-2.5 font-medium text-[var(--convene-primary)] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save availability"}
          </button>
        </form>
      </div>
    </div>
  );
}

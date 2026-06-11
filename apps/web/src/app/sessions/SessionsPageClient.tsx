"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SessionPaymentDialog } from "@/components/dashboard/SessionPaymentDialog";

type PackageCreditRow = {
  credit_id: string;
  remaining_credits: number;
  expiration_at: string | null;
  package_title: string | null;
  expert_user_id: string | null;
  session_duration_minutes: number | null;
};

type SessionRow = Record<string, unknown> & {
  id?: string;
  booking_id?: string;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  payment_status?: string;
  total_price?: number;
  total_amount?: number;
  partner_name?: string | null;
  user_role?: string;
  cancelled_at?: string | null;
};

export function SessionsPageClient() {
  const searchParams = useSearchParams();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [expertId, setExpertId] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [startTime, setStartTime] = useState("10:00:00");
  const [endTime, setEndTime] = useState("11:00:00");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [totalPrice, setTotalPrice] = useState("100");
  const [bookErr, setBookErr] = useState<string | null>(null);
  const [bookOk, setBookOk] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [packageCredits, setPackageCredits] = useState<PackageCreditRow[]>([]);
  const [packageCreditId, setPackageCreditId] = useState("");
  const [applyFirstSessionDiscount, setApplyFirstSessionDiscount] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payBookingId, setPayBookingId] = useState<string | null>(null);
  const [skipBusyId, setSkipBusyId] = useState<string | null>(null);

  const showDevSessionPaymentSkip =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_CONVENE_DEV_SESSION_PAYMENT_SKIP === "true";

  async function devSkipPaymentForBooking(bookingId: string) {
    setSkipBusyId(bookingId);
    try {
      const res = await fetch("/api/dev/complete-session-payment-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "legacy_booking", bookingId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        window.alert(typeof data.error === "string" ? data.error : "Skip payment not allowed");
        return;
      }
      await refresh();
    } finally {
      setSkipBusyId(null);
    }
  }

  async function refresh() {
    setLoadErr(null);
    const res = await fetch("/api/sessions/my-sessions?include_pending_unpaid=1");
    const data = await res.json();
    if (!res.ok) {
      setLoadErr(typeof data.error === "string" ? data.error : "Failed to load");
      setSessions([]);
      return;
    }
    setSessions((data.sessions as SessionRow[]) ?? []);
  }

  useEffect(() => {
    const e = searchParams.get("expert");
    if (e?.trim()) setExpertId(e.trim());
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/me/package-credits");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (!cancelled) {
        setPackageCredits((data.credits as PackageCreditRow[]) ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const matchingCredits = useMemo(() => {
    if (!expertId.trim()) return [];
    return packageCredits.filter((c) => {
      if (c.expert_user_id !== expertId) return false;
      if (c.remaining_credits <= 0) return false;
      if (c.session_duration_minutes == null) return false;
      if (c.expiration_at) {
        const t = new Date(c.expiration_at).getTime();
        if (Number.isFinite(t) && t < Date.now()) return false;
      }
      return true;
    });
  }, [expertId, packageCredits]);

  useEffect(() => {
    if (!packageCreditId) return;
    const ok = matchingCredits.some((c) => c.credit_id === packageCreditId);
    if (!ok) setPackageCreditId("");
  }, [matchingCredits, packageCreditId]);

  async function putStatus(
    bookingId: string,
    status: "upcoming" | "live" | "complete" | "cancelled",
    cancellationReason?: string | null
  ) {
    const res = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        cancellationReason: cancellationReason ?? null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      window.alert(typeof data.error === "string" ? data.error : "Update failed");
      return;
    }
    await refresh();
  }

  async function onBook(e: FormEvent) {
    e.preventDefault();
    setBooking(true);
    setBookErr(null);
    setBookOk(null);
    const body: Record<string, unknown> = {
      expertId,
      sessionDate,
      startTime,
      endTime,
      durationMinutes: Number(durationMinutes),
      totalPrice: packageCreditId ? 0 : Number(totalPrice),
    };
    if (packageCreditId) {
      body.packageCreditId = packageCreditId;
    } else if (applyFirstSessionDiscount) {
      body.applyFirstSessionDiscount = true;
    }
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBooking(false);
    if (!res.ok) {
      setBookErr(typeof data.error === "string" ? data.error : "Booking failed");
      return;
    }
    setBookOk("Session created.");
    await refresh();
    const pcRes = await fetch("/api/me/package-credits");
    if (pcRes.ok) {
      const pc = await pcRes.json();
      setPackageCredits((pc.credits as PackageCreditRow[]) ?? []);
    }
  }

  return (
    <>
    <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <p className="mb-2 text-sm uppercase tracking-widest text-[var(--convene-hero)]">Bookings</p>
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <p className="mt-2 text-sm text-white/75">
          Book with an active expert user id (from browse or Supabase). Pay as the learner from each row; join video
          when you are ready. Open from an expert profile with{" "}
          <span className="font-mono text-xs text-white/90">?expert=&lt;uuid&gt;</span> to prefill.
        </p>

        {loadErr ? (
          <p className="mt-4 text-sm text-red-300">
            {loadErr}{" "}
            <Link href="/login" className="text-[var(--convene-hero)] underline">
              Sign in
            </Link>
          </p>
        ) : null}

        <section className="mt-10 rounded-xl border border-white/15 bg-white/5 p-5">
          <h2 className="font-medium text-[var(--convene-hero)]">Book a session</h2>
          {bookErr ? <p className="mt-2 text-sm text-red-300">{bookErr}</p> : null}
          {bookOk ? <p className="mt-2 text-sm text-emerald-300">{bookOk}</p> : null}
          <form onSubmit={(e) => void onBook(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs text-white/80">Expert user id (UUID)</span>
              <input
                required
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 font-mono text-sm outline-none focus:border-[var(--convene-hero)]"
                value={expertId}
                onChange={(e) => setExpertId(e.target.value)}
                placeholder="expert users.user_id"
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/80">Date</span>
              <input
                type="date"
                required
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
              />
            </label>
            {matchingCredits.length > 0 ? (
              <label className="block sm:col-span-2">
                <span className="text-xs text-white/80">Payment</span>
                <select
                  className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                  value={packageCreditId}
                  onChange={(e) => {
                    const cid = e.target.value;
                    setPackageCreditId(cid);
                    if (cid) {
                      setApplyFirstSessionDiscount(false);
                      const c = matchingCredits.find((x) => x.credit_id === cid);
                      if (c?.session_duration_minutes != null) {
                        setDurationMinutes(String(c.session_duration_minutes));
                      }
                      setTotalPrice("0");
                    } else {
                      setTotalPrice("100");
                    }
                  }}
                >
                  <option value="">Card — set price below</option>
                  {matchingCredits.map((c) => (
                    <option key={c.credit_id} value={c.credit_id}>
                      Package credit · {c.package_title ?? c.credit_id.slice(0, 8)}… (
                      {c.remaining_credits} left, {c.session_duration_minutes} min)
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block">
              <span className="text-xs text-white/80">
                {packageCreditId ? "Total price (USD)" : "List price (USD, before first-session discount)"}
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                required={!packageCreditId}
                disabled={Boolean(packageCreditId)}
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)] disabled:opacity-50"
                value={totalPrice}
                onChange={(e) => setTotalPrice(e.target.value)}
              />
            </label>
            {!packageCreditId ? (
              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={applyFirstSessionDiscount}
                  onChange={(e) => setApplyFirstSessionDiscount(e.target.checked)}
                  className="mt-1 rounded border-white/40"
                />
                <span className="text-white/75">
                  Apply expert’s <strong className="text-white/90">first-session discount</strong> if I’m eligible
                  (first paid session with this expert; expert configures discount on Availability). Charged total
                  must stay at least $0.50.
                </span>
              </label>
            ) : null}
            <label className="block">
              <span className="text-xs text-white/80">Start time</span>
              <input
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/80">End time</span>
              <input
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs text-white/80">Duration (minutes)</span>
              <input
                type="number"
                min={1}
                required
                disabled={Boolean(packageCreditId)}
                className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)] disabled:opacity-50"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={booking}
              className="rounded-md bg-[var(--convene-hero)] py-2.5 font-medium text-[var(--convene-primary)] disabled:opacity-60 sm:col-span-2"
            >
              {booking ? "Booking…" : "Create booking"}
            </button>
          </form>
        </section>

        <section className="mt-10">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-medium text-[var(--convene-hero)]">Your sessions</h2>
            <button
              type="button"
              onClick={() => void refresh()}
              className="text-sm text-white/80 underline hover:text-white"
            >
              Refresh
            </button>
          </div>
          {loading ? (
            <p className="mt-4 text-sm text-white/60">Loading…</p>
          ) : sessions.length === 0 ? (
            <p className="mt-4 text-sm text-white/60">No sessions yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {sessions.map((s) => {
                const bid = String(s.id ?? s.booking_id ?? "");
                const price = s.total_price ?? s.total_amount;
                const ps = String(s.payment_status ?? "").toLowerCase();
                const unpaid = ps !== "paid" && ps !== "succeeded";
                const st = String(s.status ?? "").toLowerCase();
                const isCancelled = st === "cancelled" || !!s.cancelled_at;
                const canLifecycle = !isCancelled && st !== "complete";
                return (
                  <li key={bid} className="rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium">
                        {String(s.session_date ?? "")} · {String(s.start_time ?? "")}–{String(s.end_time ?? "")}
                      </span>
                      <span className="text-white/70">{s.user_role}</span>
                    </div>
                    <div className="mt-1 text-white/75">
                      {s.partner_name ? <>With {String(s.partner_name)} · </> : null}
                      status {String(s.status ?? "")} · payment {String(s.payment_status ?? "")}
                      {price != null ? <> · ${Number(price).toFixed(2)}</> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      <Link href={`/session/${bid}`} className="text-[var(--convene-hero)] underline">
                        Join video
                      </Link>
                      {s.user_role === "learner" && unpaid && !isCancelled ? (
                        <button
                          type="button"
                          className="text-[var(--convene-hero)] underline"
                          onClick={() => {
                            setPayBookingId(bid);
                            setPayOpen(true);
                          }}
                        >
                          Pay with card
                        </button>
                      ) : null}
                      {showDevSessionPaymentSkip && s.user_role === "learner" && unpaid && !isCancelled ? (
                        <button
                          type="button"
                          disabled={skipBusyId === bid}
                          className="text-amber-200 underline disabled:opacity-50"
                          onClick={() => void devSkipPaymentForBooking(bid)}
                        >
                          {skipBusyId === bid ? "Skipping…" : "Skip pay (dev)"}
                        </button>
                      ) : null}
                      {s.user_role === "learner" && st === "complete" ? (
                        <Link href={`/sessions/${bid}/review`} className="text-[var(--convene-hero)] underline">
                          Review expert
                        </Link>
                      ) : null}
                      {s.user_role === "expert" && st === "complete" ? (
                        <Link
                          href={`/sessions/${bid}/review-learner`}
                          className="text-[var(--convene-hero)] underline"
                        >
                          Review learner
                        </Link>
                      ) : null}
                      {canLifecycle ? (
                        <>
                          <button
                            type="button"
                            className="text-[var(--convene-hero)] underline"
                            onClick={() => void putStatus(bid, "live")}
                          >
                            Mark live
                          </button>
                          <button
                            type="button"
                            className="text-[var(--convene-hero)] underline"
                            onClick={() => void putStatus(bid, "complete")}
                          >
                            Mark complete
                          </button>
                          <button
                            type="button"
                            className="text-red-300 underline"
                            onClick={() => {
                              const r = window.prompt("Cancellation reason (optional)") ?? "";
                              void putStatus(bid, "cancelled", r.trim() || null);
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="mt-8 text-sm text-white/50">
          <Link href="/experts" className="text-[var(--convene-hero)] underline">
            Browse experts
          </Link>
        </p>
      </div>
    </div>
    <SessionPaymentDialog
      open={payOpen}
      onOpenChange={(o) => {
        setPayOpen(o);
        if (!o) setPayBookingId(null);
      }}
      bookingId={payBookingId}
      onPaid={() => void refresh()}
    />
    </>
  );
}

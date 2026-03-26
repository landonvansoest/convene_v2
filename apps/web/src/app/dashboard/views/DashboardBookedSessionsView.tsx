"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SessionManageDialog, type ManagedSessionRow } from "@/components/dashboard/SessionManageDialog";
import { ReviewFlowDialog } from "@/components/reviews/ReviewFlowDialog";

type SessionRow = ManagedSessionRow & {
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
  partner_photo?: string | null;
  learner_id?: string;
  expert_id?: string;
  user_role?: string;
  cancelled_at?: string | null;
};

function isJoinWindowOpen(sessionDate: string | undefined, startTime: string | undefined): boolean {
  if (!sessionDate) return false;
  const st = (startTime || "00:00:00").toString();
  const timePart =
    st.length >= 8 ? st.slice(0, 8) : st.length >= 5 ? `${st.slice(0, 5)}:00` : "00:00:00";
  const start = new Date(`${sessionDate}T${timePart}`);
  const t = start.getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() >= t - 10 * 60 * 1000;
}

function partnerUserId(s: SessionRow): string | null {
  const role = String(s.user_role ?? "").toLowerCase();
  if (role === "learner") return s.expert_id ? String(s.expert_id) : null;
  if (role === "expert") return s.learner_id ? String(s.learner_id) : null;
  return null;
}

export default function DashboardBookedSessionsView() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [manageSession, setManageSession] = useState<SessionRow | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewBookingId, setReviewBookingId] = useState("");
  const [reviewRole, setReviewRole] = useState<"learner" | "expert">("learner");

  const refresh = useCallback(async () => {
    setLoadErr(null);
    const res = await fetch("/api/sessions/my-sessions");
    const data = await res.json();
    if (!res.ok) {
      setLoadErr(typeof data.error === "string" ? data.error : "Failed to load");
      setSessions([]);
      return;
    }
    setSessions((data.sessions as SessionRow[]) ?? []);
  }, []);

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
  }, [refresh]);

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

  const { upcoming, past } = useMemo(() => {
    const u: SessionRow[] = [];
    const p: SessionRow[] = [];
    for (const s of sessions) {
      const st = String(s.status ?? "").toLowerCase();
      const cancelled = st === "cancelled" || !!s.cancelled_at;
      if (st === "complete" || cancelled) {
        p.push(s);
      } else if (st === "upcoming" || st === "live") {
        u.push(s);
      } else {
        p.push(s);
      }
    }
    const bySoonest = (a: SessionRow, b: SessionRow) => {
      const da = String(a.session_date ?? "");
      const db = String(b.session_date ?? "");
      if (da !== db) return da.localeCompare(db);
      return String(a.start_time ?? "").localeCompare(String(b.start_time ?? ""));
    };
    u.sort(bySoonest);
    p.sort((a, b) => -bySoonest(a, b));
    return { upcoming: u, past: p };
  }, [sessions]);

  const list = tab === "upcoming" ? upcoming : past;

  return (
    <div className="rounded-xl border-2 border-[#003049]/10 bg-white p-6 shadow-sm">
      <SessionManageDialog
        open={manageSession != null}
        onOpenChange={(o) => {
          if (!o) setManageSession(null);
        }}
        session={manageSession}
        onPutStatus={(bookingId, status, reason) => void putStatus(bookingId, status, reason)}
      />
      <ReviewFlowDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        bookingId={reviewBookingId}
        role={reviewRole}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#003049]">Booked sessions</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Your join link is available from about ten minutes before the scheduled start through the end of the
            session.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-[#003049]/15 px-3 py-1.5 text-sm font-medium text-[#003049] hover:bg-gray-50"
          >
            Refresh
          </button>
          <Link
            href="/sessions"
            className="rounded-lg bg-[#F77F00] px-3 py-1.5 text-sm font-medium text-white hover:opacity-95"
          >
            Book a session
          </Link>
        </div>
      </div>

      <div className="mt-6 inline-flex rounded-lg border border-[#003049]/15 p-0.5">
        <button
          type="button"
          onClick={() => setTab("upcoming")}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            tab === "upcoming" ? "bg-[#003049] text-white" : "text-[#003049] hover:bg-gray-50"
          }`}
        >
          Upcoming ({upcoming.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("past")}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            tab === "past" ? "bg-[#003049] text-white" : "text-[#003049] hover:bg-gray-50"
          }`}
        >
          Past ({past.length})
        </button>
      </div>

      {loadErr ? (
        <p className="mt-4 text-sm text-red-600">
          {loadErr}{" "}
          <Link href="/login" className="font-medium text-[#F77F00] underline">
            Sign in
          </Link>
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {tab === "upcoming" ? "No upcoming sessions." : "No past sessions yet."}
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {list.map((s) => {
            const id = String(s.id ?? s.booking_id ?? "");
            const price = s.total_price ?? s.total_amount;
            const ps = String(s.payment_status ?? "").toLowerCase();
            const unpaid = ps !== "paid" && ps !== "succeeded";
            const st = String(s.status ?? "").toLowerCase();
            const isCancelled = st === "cancelled" || !!s.cancelled_at;
            const canLifecycle = !isCancelled && st !== "complete";
            const paid = !unpaid;
            const joinAllowed = paid && !isCancelled && (st === "live" || isJoinWindowOpen(s.session_date, s.start_time));
            const pid = partnerUserId(s);

            return (
              <li
                key={id || JSON.stringify(s)}
                className="flex flex-col gap-3 rounded-xl border border-[#003049]/10 bg-gray-50/60 p-4 sm:flex-row sm:items-start"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-[#003049]/10 bg-white">
                  {s.partner_photo ? (
                    <Image
                      src={s.partner_photo}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="56px"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-[#003049]/40">
                      {(s.partner_name || "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-[#003049]">
                      {s.partner_name?.trim() || "Session"}
                      {s.user_role ? (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          · You are the {String(s.user_role)}
                        </span>
                      ) : null}
                    </p>
                    {price != null ? (
                      <span className="text-sm tabular-nums text-muted-foreground">${Number(price).toFixed(2)}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {String(s.session_date ?? "")} · {String(s.start_time ?? "")}–{String(s.end_time ?? "")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Status {String(s.status ?? "—")} · Payment {String(s.payment_status ?? "—")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    <button
                      type="button"
                      className="font-semibold text-[#003049] underline underline-offset-2"
                      onClick={() => setManageSession(s)}
                    >
                      Manage session
                    </button>
                    {joinAllowed ? (
                      <Link href={`/sessions/${id}/join`} className="font-medium text-[#F77F00] underline underline-offset-2">
                        Join session
                      </Link>
                    ) : paid && !isCancelled && (st === "upcoming" || st === "live") ? (
                      <span className="text-xs text-muted-foreground">Join opens 10 minutes before start</span>
                    ) : null}
                    {s.user_role === "learner" && unpaid && !isCancelled ? (
                      <Link href={`/sessions/${id}/pay`} className="font-medium text-[#F77F00] underline underline-offset-2">
                        Pay
                      </Link>
                    ) : null}
                    {pid ? (
                      <Link
                        href={`/messages/${encodeURIComponent(pid)}`}
                        className="font-medium text-[#F77F00] underline underline-offset-2"
                      >
                        Message
                      </Link>
                    ) : null}
                    {s.user_role === "learner" && st === "complete" ? (
                      <>
                        <button
                          type="button"
                          className="font-medium text-[#F77F00] underline underline-offset-2"
                          onClick={() => {
                            setReviewBookingId(id);
                            setReviewRole("learner");
                            setReviewOpen(true);
                          }}
                        >
                          Review wizard
                        </button>
                        <Link href={`/sessions/${id}/review`} className="font-medium text-[#F77F00] underline underline-offset-2">
                          Review (full page)
                        </Link>
                      </>
                    ) : null}
                    {s.user_role === "expert" && st === "complete" ? (
                      <>
                        <button
                          type="button"
                          className="font-medium text-[#F77F00] underline underline-offset-2"
                          onClick={() => {
                            setReviewBookingId(id);
                            setReviewRole("expert");
                            setReviewOpen(true);
                          }}
                        >
                          Review wizard
                        </button>
                        <Link
                          href={`/sessions/${id}/review-learner`}
                          className="font-medium text-[#F77F00] underline underline-offset-2"
                        >
                          Review (full page)
                        </Link>
                      </>
                    ) : null}
                    {canLifecycle ? (
                      <>
                        <button
                          type="button"
                          className="font-medium text-[#F77F00] underline underline-offset-2"
                          onClick={() => void putStatus(id, "live")}
                        >
                          Mark live
                        </button>
                        <button
                          type="button"
                          className="font-medium text-[#F77F00] underline underline-offset-2"
                          onClick={() => void putStatus(id, "complete")}
                        >
                          Mark complete
                        </button>
                        <button
                          type="button"
                          className="font-medium text-red-600 underline underline-offset-2"
                          onClick={() => {
                            const r = window.prompt("Cancellation reason (optional)") ?? "";
                            void putStatus(id, "cancelled", r.trim() || null);
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

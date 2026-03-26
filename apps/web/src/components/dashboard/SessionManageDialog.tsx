"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CalendarClock, CreditCard, MessageSquare, Video, ClipboardList } from "lucide-react";

export type ManagedSessionRow = Record<string, unknown> & {
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

function partnerUserId(s: ManagedSessionRow): string | null {
  const role = String(s.user_role ?? "").toLowerCase();
  if (role === "learner") return s.expert_id ? String(s.expert_id) : null;
  if (role === "expert") return s.learner_id ? String(s.learner_id) : null;
  return null;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ManagedSessionRow | null;
  onPutStatus: (
    bookingId: string,
    status: "upcoming" | "live" | "complete" | "cancelled",
    cancellationReason?: string | null
  ) => void | Promise<void>;
};

export function SessionManageDialog({ open, onOpenChange, session, onPutStatus }: Props) {
  if (!session) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage session</DialogTitle>
            <DialogDescription>No session selected.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const id = String(session.id ?? session.booking_id ?? "");
  const price = session.total_price ?? session.total_amount;
  const ps = String(session.payment_status ?? "").toLowerCase();
  const unpaid = ps !== "paid" && ps !== "succeeded";
  const st = String(session.status ?? "").toLowerCase();
  const isCancelled = st === "cancelled" || !!session.cancelled_at;
  const canLifecycle = !isCancelled && st !== "complete";
  const paid = !unpaid;
  const joinAllowed =
    paid && !isCancelled && (st === "live" || isJoinWindowOpen(session.session_date, session.start_time));
  const pid = partnerUserId(session);
  const role = String(session.user_role ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#003049]">
            <ClipboardList className="h-5 w-5 text-[#F77F00]" />
            Manage session
          </DialogTitle>
          <DialogDescription>
            v1-style command center. Actions use the same routes and APIs as the list below; this dialog is for
            testing and UX parity.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-3 rounded-lg border border-[#003049]/10 bg-gray-50/80 p-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-[#003049]/10 bg-white">
            {session.partner_photo ? (
              <Image
                src={session.partner_photo}
                alt=""
                fill
                className="object-cover"
                sizes="56px"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-[#003049]/40">
                {(session.partner_name || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-[#003049]">{session.partner_name?.trim() || "Session"}</p>
            <p className="text-xs text-muted-foreground">You are the {role || "participant"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {String(session.session_date ?? "")} · {String(session.start_time ?? "")}–
              {String(session.end_time ?? "")}
            </p>
            <p className="text-xs text-muted-foreground">
              Status <span className="font-medium">{String(session.status ?? "—")}</span> · Payment{" "}
              <span className="font-medium">{String(session.payment_status ?? "—")}</span>
              {price != null ? (
                <>
                  {" "}
                  · <span className="tabular-nums">${Number(price).toFixed(2)}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#003049]">
              <Video className="h-4 w-4 text-[#F77F00]" />
              Video
            </h3>
            {joinAllowed ? (
              <Button asChild className="w-full bg-[#F77F00] text-white hover:bg-[#F77F00]/90">
                <Link href={`/sessions/${id}/join`} onClick={() => onOpenChange(false)}>
                  Join session
                </Link>
              </Button>
            ) : paid && !isCancelled && (st === "upcoming" || st === "live") ? (
              <p className="text-sm text-muted-foreground">Join opens about 10 minutes before the scheduled start.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Join is not available for this session state.</p>
            )}
          </section>

          <Separator />

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#003049]">
              <CreditCard className="h-4 w-4 text-[#F77F00]" />
              Payment
            </h3>
            {role === "learner" && unpaid && !isCancelled ? (
              <Button asChild variant="outline" className="w-full border-[#003049] text-[#003049]">
                <Link href={`/sessions/${id}/pay`} onClick={() => onOpenChange(false)}>
                  Pay for session
                </Link>
              </Button>
            ) : role === "learner" ? (
              <p className="text-sm text-muted-foreground">No learner payment step for this booking state.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Learner pays from their account; experts see payout via Stripe Connect.</p>
            )}
          </section>

          <Separator />

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#003049]">
              <MessageSquare className="h-4 w-4 text-[#F77F00]" />
              Messages
            </h3>
            {pid ? (
              <Button asChild variant="secondary" className="w-full">
                <Link href={`/messages/${encodeURIComponent(pid)}`} onClick={() => onOpenChange(false)}>
                  Open conversation
                </Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Partner id missing — cannot open thread.</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              v1 used an inline chat modal; v2 uses the full messages page (embed modal is optional later).
            </p>
          </section>

          <Separator />

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#003049]">
              <CalendarClock className="h-4 w-4 text-[#F77F00]" />
              Reviews
            </h3>
            <div className="flex flex-col gap-2">
              {role === "learner" && st === "complete" ? (
                <Button asChild variant="outline" className="w-full border-[#003049] text-[#003049]">
                  <Link href={`/sessions/${id}/review`} onClick={() => onOpenChange(false)}>
                    Review expert
                  </Link>
                </Button>
              ) : null}
              {role === "expert" && st === "complete" ? (
                <Button asChild variant="outline" className="w-full border-[#003049] text-[#003049]">
                  <Link href={`/sessions/${id}/review-learner`} onClick={() => onOpenChange(false)}>
                    Review learner
                  </Link>
                </Button>
              ) : null}
              {st !== "complete" ? (
                <p className="text-sm text-muted-foreground">Reviews unlock after the session is complete.</p>
              ) : null}
            </div>
          </section>

          {canLifecycle ? (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold text-[#003049]">Expert / lifecycle</h3>
                <p className="mb-2 text-xs text-muted-foreground">
                  Same status API as the dashboard list. Confirm Bible-allowed transitions before production use.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void onPutStatus(id, "live")}
                  >
                    Mark live
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void onPutStatus(id, "complete")}
                  >
                    Mark complete
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      const r = window.prompt("Cancellation reason (optional)") ?? "";
                      void onPutStatus(id, "cancelled", r.trim() || null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

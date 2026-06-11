"use client";

import Image from "next/image";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ClipboardList, Gift, Ban, CalendarRange } from "lucide-react";
import { SendOfferDialog } from "@/components/dashboard/SendOfferDialog";
import { RescheduleSessionDialog } from "@/components/dashboard/RescheduleSessionDialog";
import { sessionWallClockInstant } from "@/lib/sessionWallClock";

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

function ordinalSuffix(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (k >= 11 && k <= 13) return "th";
  if (j === 1) return "st";
  if (j === 2) return "nd";
  if (j === 3) return "rd";
  return "th";
}

/** e.g. "April 28th" */
function monthDayOrdinal(date: Date): string {
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
  const d = date.getDate();
  return `${month} ${d}${ordinalSuffix(d)}`;
}

function formatTimeHm(d: Date): string {
  return d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s/g, "")
    .toLowerCase();
}

function sessionTimeString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string" && value.trim() !== "") return value;
  return undefined;
}

/** e.g. "April 28th | 3:15pm–3:45pm" */
function formatSessionDatePipeRange(sessionDate: string | undefined, startTime: unknown, endTime: unknown): string {
  const a = sessionWallClockInstant(String(sessionDate ?? ""), sessionTimeString(startTime));
  const b = sessionWallClockInstant(String(sessionDate ?? ""), sessionTimeString(endTime));
  if (!a || !b) return "—";
  return `${monthDayOrdinal(a)} | ${formatTimeHm(a)}–${formatTimeHm(b)}`;
}

/** e.g. "Booked April 28th, 3:15pm · Total Paid $69.96" */
function formatBookedLine(
  sessionDate: string | undefined,
  startTime: unknown,
  price: number | null | undefined,
): string {
  const start = sessionWallClockInstant(String(sessionDate ?? ""), sessionTimeString(startTime));
  if (!start) return price != null ? `Booked · Total Paid $${Number(price).toFixed(2)}` : "Booked";
  const dayPart = monthDayOrdinal(start);
  const t = formatTimeHm(start);
  const paid =
    price != null ? `Total Paid $${Number(price).toFixed(2)}` : "Total Paid —";
  return `Booked ${dayPart}, ${t} · ${paid}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ManagedSessionRow | null;
  onPutStatus: (
    bookingId: string,
    status: "upcoming" | "live" | "complete" | "cancelled",
    cancellationReason?: string | null,
  ) => void | Promise<void>;
  /** Retry checkout after `payment_status === "failed"` */
  onPayForSession?: (bookingId: string) => void;
  /** Invoked after reschedule / offer succeeds so the dashboard can refresh bookings. */
  onSessionUpdated?: () => void;
};

export function SessionManageDialog({
  open,
  onOpenChange,
  session,
  onPutStatus,
  onPayForSession: _onPayForSession,
  onSessionUpdated,
}: Props) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);

  if (!session) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Session</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const id = String(session.id ?? session.booking_id ?? "");
  const price = session.total_price ?? session.total_amount;
  const st = String(session.status ?? "").toLowerCase();
  const isCancelled = st === "cancelled" || !!session.cancelled_at;
  const role = String(session.user_role ?? "").toLowerCase();
  const isExpert = role === "expert";

  const counterpartId = isExpert ? (session.learner_id ? String(session.learner_id) : "") : (session.expert_id ? String(session.expert_id) : "");
  const counterpartName = session.partner_name?.trim() || "your partner";

  const datePipeRange = formatSessionDatePipeRange(session.session_date, session.start_time, session.end_time);
  const bookedLine = formatBookedLine(session.session_date, session.start_time, price);

  function confirmCancel() {
    if (!window.confirm("Cancel this session? Your partner will see the updated status on their dashboard.")) {
      return;
    }
    const r = window.prompt("Optional cancellation reason (visible to support)") ?? "";
    void (async () => {
      await onPutStatus(id, "cancelled", r.trim() || null);
      onSessionUpdated?.();
      onOpenChange(false);
    })();
  }

  return (
    <>
      <RescheduleSessionDialog
        open={rescheduleOpen}
        onOpenChange={(o) => setRescheduleOpen(o)}
        bookingId={id}
        toUserId={counterpartId}
        defaultDate={session.session_date ? String(session.session_date) : undefined}
        defaultStartTime={session.start_time ? String(session.start_time) : undefined}
        defaultEndTime={session.end_time ? String(session.end_time) : undefined}
        counterpartName={counterpartName}
        viewerRole={isExpert ? "expert" : "learner"}
        onSubmitted={() => {
          onSessionUpdated?.();
          onOpenChange(false);
        }}
      />
      {isExpert && counterpartId ? (
        <SendOfferDialog
          open={offerOpen}
          onOpenChange={setOfferOpen}
          recipientUserId={counterpartId}
          recipientFullName={counterpartName}
          recipientFirstName={counterpartName.split(/\s+/)[0]}
          relatedBookingId={id}
          onSubmitted={() => {
            onSessionUpdated?.();
            onOpenChange(false);
          }}
        />
      ) : null}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#003049]">
              <ClipboardList className="h-5 w-5 text-[#F77F00]" />
              Manage Session
            </DialogTitle>
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
              <p className="font-semibold text-[#003049]">{counterpartName}</p>
              <p className="mt-1 text-sm text-[#003049]/80">{datePipeRange}</p>
              <p className="mt-1 text-xs text-muted-foreground">{bookedLine}</p>
            </div>
          </div>

          {!isCancelled && st !== "complete" ? (
            <div data-tour-target="tour-manage-booking" className="mt-5 space-y-3">
              <div className="grid gap-2 sm:grid-cols-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 justify-start gap-2 border-[#003049]/20 bg-white font-semibold text-[#003049] hover:bg-[#003049]/5"
                  disabled={!counterpartId || isCancelled || st === "complete"}
                  onClick={() => setRescheduleOpen(true)}
                >
                  <CalendarRange className="h-4 w-4 shrink-0 text-[#F77F00]" aria-hidden />
                  Reschedule Session
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 justify-start gap-2 border-red-200 bg-red-50/60 font-semibold text-red-900 hover:bg-red-100/80"
                  disabled={isCancelled}
                  onClick={confirmCancel}
                >
                  <Ban className="h-4 w-4 shrink-0" aria-hidden />
                  Cancel Session
                </Button>
                {isExpert && counterpartId ? (
                  <Button
                    type="button"
                    className="h-11 justify-start gap-2 bg-[#F77F00] font-semibold text-white hover:bg-[#F77F00]/92"
                    onClick={() => setOfferOpen(true)}
                  >
                    <Gift className="h-4 w-4 shrink-0" aria-hidden />
                    Send an Offer
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

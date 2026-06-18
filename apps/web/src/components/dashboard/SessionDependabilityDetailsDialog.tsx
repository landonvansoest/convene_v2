"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DependabilityBreakdownResult } from "@/lib/dependability-breakdown";
import { formatDependabilityRating } from "@/lib/formatDependabilityRating";

type Grid = {
  expertName: string;
  learnerName: string;
  sessionDateLabel: string;
  scheduledStartTimeLabel: string;
  scheduledEndTimeLabel: string;
  scheduledDurationLabel: string;
  totalExtensionSummary: string | null;
  canceledAtLabel: string | null;
  rescheduledAtLabel: string | null;
  expertJoinTimeLabel: string | null;
  learnerJoinTimeLabel: string | null;
};

type ApiPayload = {
  breakdown: DependabilityBreakdownResult;
  grid: Grid;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string | null;
};

function DetailRow({
  label,
  value,
  valueClassName,
  sectionSpacingAfter,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  /** Extra space below this row to separate visual sections. */
  sectionSpacingAfter?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-x-6 gap-y-0 py-1 sm:grid-cols-[minmax(11rem,42%)_1fr] sm:items-start [&_*]:leading-tight ${sectionSpacingAfter ? "mb-5" : ""}`}
    >
      <div className="text-sm font-semibold leading-tight text-[#003049]">{label}</div>
      <div className={`text-sm leading-tight text-foreground ${valueClassName ?? ""}`}>{value}</div>
    </div>
  );
}

export function SessionDependabilityDetailsDialog({ open, onOpenChange, bookingId }: Props) {
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !bookingId) {
      setPayload(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}/dependability-details`);
      const j = (await res.json()) as Partial<ApiPayload> & { error?: string };
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setPayload(null);
        setErr(typeof j.error === "string" ? j.error : "Could not load session details");
        return;
      }
      if (j.breakdown && j.grid) {
        setPayload({ breakdown: j.breakdown, grid: j.grid });
      } else {
        setPayload(null);
        setErr("Unexpected response");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, bookingId]);

  const b = payload?.breakdown;
  const g = payload?.grid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92vh,800px)] max-w-lg gap-2 overflow-y-auto">
        <DialogHeader className="space-y-1 pb-0">
          <DialogTitle className="text-left text-lg leading-tight text-[#003049]">Session details</DialogTitle>
        </DialogHeader>

        {loading ? <p className="py-2 text-sm leading-tight text-muted-foreground">Loading…</p> : null}
        {err ? <p className="py-1 text-sm leading-tight text-destructive">{err}</p> : null}

        {!loading && !err && b && g ? (
          <div className="text-sm leading-tight text-[#003049]">
            <DetailRow label="Expert Name" value={g.expertName || "—"} />
            <DetailRow label="Learner Name" value={g.learnerName || "—"} sectionSpacingAfter />
            <DetailRow label="Session Date" value={g.sessionDateLabel} />
            <DetailRow label="Scheduled Start Time" value={g.scheduledStartTimeLabel} />
            <DetailRow label="Scheduled End Time" value={g.scheduledEndTimeLabel} />
            <DetailRow label="Scheduled Duration" value={g.scheduledDurationLabel} sectionSpacingAfter />
            {g.totalExtensionSummary ? <DetailRow label="Total Extension Time" value={g.totalExtensionSummary} /> : null}
            {g.canceledAtLabel ? <DetailRow label="Canceled at" value={g.canceledAtLabel} /> : null}
            {g.rescheduledAtLabel ? <DetailRow label="Rescheduled at" value={g.rescheduledAtLabel} /> : null}
            <DetailRow label="Expert Join Time" value={g.expertJoinTimeLabel ?? "—"} />
            <DetailRow label="Learner Join Time" value={g.learnerJoinTimeLabel ?? "—"} sectionSpacingAfter />
            <DetailRow
              label="Dependability Rating*"
              value={
                <div className="space-y-1">
                  <p className="text-sm font-semibold leading-none tabular-nums text-[#003049]">
                    {formatDependabilityRating(b.viewerSessionScore)}
                  </p>
                  {b.lineItems.length > 0 ? (
                    <ul className="list-none space-y-0 pl-0 text-[#003049]/90">
                      {b.lineItems.map((item) => (
                        <li key={item.code} className="text-sm leading-tight">
                          −{item.deduction} points for {item.publicPhrase}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm leading-tight text-muted-foreground">No deductions apply for this session.</p>
                  )}
                </div>
              }
            />

            <p className="mt-3 pt-1 text-xs leading-tight text-muted-foreground">
              *Dependability rating is based on a total possible score of 100 points. Deductions are made for
              cancelations, reschedule requests, and for joining sessions past the scheduled start time.
            </p>

            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                className="h-9 bg-[#003049] px-4 text-sm leading-tight text-white hover:bg-[#003049]/90"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

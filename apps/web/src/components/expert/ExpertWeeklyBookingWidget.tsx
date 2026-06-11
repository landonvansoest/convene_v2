"use client";

import type { BookingWeekPreview } from "@/lib/expertBookingPreview";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  expertId: string;
  preview: BookingWeekPreview | null;
  onPickSlot?: (utcMs: number, label: string) => void;
};

export function ExpertWeeklyBookingWidget({ expertId: expertId, preview, onPickSlot }: Props) {
  const week = preview?.days ?? [];
  const monthYearLabel = preview?.monthYearLabel ?? "";
  const anySlot = week.some((d) => d.slots.length > 0);

  return (
    <Card className="border border-border shadow-sm">
      <CardContent className="space-y-3 p-3">
        <div className="flex items-center justify-between px-2 text-convene-primary">
          <button
            type="button"
            aria-label="Previous week"
            disabled
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground opacity-40"
            title="Coming soon"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <p className="text-lg font-semibold">{monthYearLabel || "Availability"}</p>
          </div>
          <button
            type="button"
            aria-label="Next week"
            disabled
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground opacity-40"
            title="Coming soon"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {!preview ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            This expert has not published weekly hours yet.
          </p>
        ) : !anySlot ? (
          <div className="space-y-2 px-2 py-4 text-center text-sm text-muted-foreground">
            <p>No bookable times in the next seven days (check minimum notice or calendar pause).</p>
          </div>
        ) : null}

        {preview && anySlot ? (
          <>
            <div className="overflow-x-auto">
              <div className="grid min-w-[700px] grid-cols-7 overflow-hidden rounded-xl border border-border bg-white">
                {week.map((d) => (
                  <div
                    key={`head-${d.weekdayShort}-${d.dayNum}-${expertId}`}
                    className="border-r border-border bg-[#003049] px-2 py-2 text-center text-white last:border-r-0"
                  >
                    <p className="text-sm font-semibold">{d.weekdayShort}</p>
                    <p className="text-[1.5rem] font-bold leading-none">{d.dayNum}</p>
                  </div>
                ))}
                {week.map((d) => (
                  <div
                    key={`body-${d.weekdayShort}-${d.dayNum}-${expertId}`}
                    className="flex min-h-[215px] max-h-[min(40vh,22rem)] flex-col border-r border-border bg-white p-1.5 last:border-r-0"
                  >
                    {d.slots.length === 0 ? (
                      <p className="px-1 pt-3 text-center text-sm text-muted-foreground">No slots</p>
                    ) : (
                      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin]">
                        <div className="space-y-1.5 pr-0.5">
                          {d.slots.map((slot, slotIdx) => {
                            const utcMs = d.slotStartsUtcMs?.[slotIdx];
                            return (
                              <button
                                key={`${d.weekdayShort}-${slot}-${slotIdx}`}
                                type="button"
                                className="w-full rounded-md border border-convene-primary/40 bg-convene-primary/20 px-1.5 py-1.5 text-xs font-medium text-convene-primary hover:bg-convene-primary/28"
                                onClick={() => {
                                  if (utcMs != null && onPickSlot) onPickSlot(utcMs, slot);
                                }}
                              >
                                {slot}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

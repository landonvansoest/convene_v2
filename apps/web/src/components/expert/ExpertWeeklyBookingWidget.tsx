"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarRange, Info } from "lucide-react";

type Props = {
  expertId: string;
  expertName: string;
};

/** Visual shell for v1/Bible weekly booking strip; real slots need availability API wiring. */
export function ExpertWeeklyBookingWidget({ expertId, expertName }: Props) {
  const week = useMemo(() => {
    const out: { label: string; sub: string; mock: string }[] = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dow = d.toLocaleDateString(undefined, { weekday: "short" });
      const md = d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
      out.push({
        label: dow,
        sub: md,
        mock: i % 3 === 0 ? "9a" : i % 3 === 1 ? "—" : "2p",
      });
    }
    return out;
  }, []);

  return (
    <Card className="border-2 border-[#003049]/15 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg text-[#003049]">
          <CalendarRange className="h-5 w-5 text-[#F77F00]" />
          Book a session
        </CardTitle>
        <CardDescription>
          Weekly view (UI placeholder). Choose a time with {expertName} — availability sync is not wired in this
          widget yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-1 overflow-x-auto pb-1 pt-1">
          {week.map((d) => (
            <div
              key={`${d.label}-${d.sub}`}
              className="flex min-w-[4.25rem] flex-col items-center rounded-lg border border-[#003049]/10 bg-gray-50/80 px-2 py-2 text-center"
            >
              <span className="text-xs font-semibold text-[#003049]">{d.label}</span>
              <span className="text-[10px] text-muted-foreground">{d.sub}</span>
              <span className="mt-2 rounded-md bg-white px-2 py-0.5 text-xs tabular-nums text-muted-foreground ring-1 ring-[#003049]/10">
                {d.mock}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm text-[#003049]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p>
            <strong>Operator note:</strong> Hook this strip to a public availability endpoint and expert timezone. Until
            then, use the booking lab with this expert pre-filled.
          </p>
        </div>

        <Button asChild className="w-full bg-[#F77F00] text-white hover:bg-[#F77F00]/90">
          <Link href={`/sessions?expert=${encodeURIComponent(expertId)}`}>Continue to booking</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

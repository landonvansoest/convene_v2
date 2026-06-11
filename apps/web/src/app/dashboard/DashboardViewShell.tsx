"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared dashboard view wrapper: intentionally no card chrome. */
export const dashboardViewCardClass = "";
/** Standard white content box rendered below a view heading/actions row. */
export const dashboardViewContentBoxClass =
  "mt-6 rounded-xl border border-[#003049]/10 bg-white p-5 shadow-sm sm:p-6";

export function DashboardViewHeader({
  Icon,
  title,
  subtitle,
  actions,
}: {
  Icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#F77F00] text-white shadow-sm">
        <Icon className="h-5 w-5" strokeWidth={2.25} aria-hidden />
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[#003049] sm:text-2xl">{title}</h1>
          {subtitle ? (
            <div className="mt-1 text-sm font-medium text-[#003049]/65">{subtitle}</div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Active / inactive classes for pill tabs (orange accent, not navy fill). */
export function dashboardTabPillClass(active: boolean) {
  return cn(
    "rounded-md px-4 py-2 text-sm font-medium transition-colors",
    active ? "bg-[#003049] text-white shadow-sm" : "text-[#003049] hover:bg-gray-50",
  );
}

export const dashboardInputClass =
  "w-full rounded-lg border border-[#003049]/15 bg-white px-3 py-2 text-[13px] text-[#003049] outline-none placeholder:text-[#003049]/45 focus:border-[#F77F00] focus:ring-1 focus:ring-[#F77F00]";

export const dashboardLabelClass = "text-sm font-medium text-[#003049]/80";

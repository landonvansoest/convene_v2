"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { WeeklyAvailabilityCalendar } from "@/components/expert/WeeklyAvailabilityCalendar";
import {
  buildTimeOptions,
  formatTimeSlotLabel12h,
  normalizeWeeklySchedule,
  type WeekdayKey,
  type WeeklyScheduleState,
  type WeeklySlot,
} from "@/components/expert/weeklyAvailabilityUtils";
import {
  dashboardViewCardClass,
  dashboardViewContentBoxClass,
  DashboardViewHeader,
  dashboardLabelClass,
} from "@/app/dashboard/DashboardViewShell";
import { availabilityRecordToPutBody } from "@/lib/expert-availability-dashboard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const TIME_OPTS = buildTimeOptions();

function iso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function weekdayKeyFromDate(d: Date): WeekdayKey {
  const keys: WeekdayKey[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return keys[d.getDay()] ?? "monday";
}

function parseMinutesBooking(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const s = String(v);
  const m1 = s.match(/^(\d+)\s*minutes?$/i);
  if (m1) return Number(m1[1]);
  const m2 = s.match(/^(\d+):(\d{2}):(\d{2})/);
  if (m2) return Number(m2[1]) * 60 + Number(m2[2]);
  return undefined;
}

function isoDateOnly(v: unknown): string {
  if (!v) return "";
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : "";
}

function parseOverrides(raw: unknown): Record<string, WeeklySlot[]> {
  const out: Record<string, WeeklySlot[]> = {};
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const date = typeof o.date === "string" ? o.date.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const slotsRaw = o.slots;
    const slots: WeeklySlot[] = [];
    if (Array.isArray(slotsRaw)) {
      for (const s of slotsRaw) {
        if (!s || typeof s !== "object") continue;
        const r = s as Record<string, unknown>;
        const start = String(r.start ?? "").trim();
        const end = String(r.end ?? "").trim();
        if (start && end) slots.push({ start: start.slice(0, 5), end: end.slice(0, 5) });
      }
    }
    out[date] = slots;
  }
  return out;
}

function effectiveSlots(
  dateStr: string,
  weekly: WeeklyScheduleState,
  overrides: Record<string, WeeklySlot[] | undefined>,
): WeeklySlot[] {
  if (Object.prototype.hasOwnProperty.call(overrides, dateStr)) {
    return overrides[dateStr] ?? [];
  }
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return [];
  return weekly[weekdayKeyFromDate(d)] ?? [];
}

function enumerateRange(isoA: string, isoB: string): string[] {
  const d1 = new Date(`${isoA}T12:00:00`).getTime();
  const d2 = new Date(`${isoB}T12:00:00`).getTime();
  if (!Number.isFinite(d1) || !Number.isFinite(d2)) return [isoA];
  const [start, end] = d1 <= d2 ? [d1, d2] : [d2, d1];
  const out: string[] = [];
  for (let t = start; t <= end; t += 86400000) {
    out.push(iso(new Date(t)));
  }
  return out;
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function formatDayHeading(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  return d.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/** Slots to show when opening editor for one or many days (same list applied to all days on save for ranges). */
function initialEditorSlots(
  dates: string[],
  weekly: WeeklyScheduleState,
  overrides: Record<string, WeeklySlot[] | undefined>,
): WeeklySlot[] {
  if (dates.length === 0) return [];
  if (dates.length === 1) return effectiveSlots(dates[0], weekly, overrides).map((s) => ({ ...s }));
  const first = effectiveSlots(dates[0], weekly, overrides);
  const key = JSON.stringify(first);
  for (let i = 1; i < dates.length; i++) {
    if (JSON.stringify(effectiveSlots(dates[i], weekly, overrides)) !== key) {
      return [];
    }
  }
  return first.map((s) => ({ ...s }));
}

function calendarMonthCells(monthAnchor: Date): Date[] {
  const y = monthAnchor.getFullYear();
  const m = monthAnchor.getMonth();
  const first = new Date(y, m, 1);
  const startDay = first.getDay();
  const gridStart = new Date(y, m, 1 - startDay);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }
  return cells;
}

export default function DashboardExpertAvailabilityView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadOk, setLoadOk] = useState(false);

  const [weekly, setWeekly] = useState<WeeklyScheduleState>(() => normalizeWeeklySchedule({}));
  const [overrides, setOverrides] = useState<Record<string, WeeklySlot[] | undefined>>({});
  const [calendarPaused, setCalendarPaused] = useState(false);

  const [monthAnchor, setMonthAnchor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  const [sessions, setSessions] = useState<
    Array<{ session_date?: string; status?: string; cancelled_at?: unknown }>
  >([]);

  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifyDates, setModifyDates] = useState<string[]>([]);
  const [editSlots, setEditSlots] = useState<WeeklySlot[]>([]);
  const [addStart, setAddStart] = useState("09:00");
  const [addEnd, setAddEnd] = useState("10:00");

  const [dragHighlight, setDragHighlight] = useState<string[]>([]);
  const dragRef = useRef<{ anchor: string | null }>({ anchor: null });
  const rangeRef = useRef<string[]>([]);

  const [multiDlg, setMultiDlg] = useState<{ dates: string[] } | null>(null);
  const [bookingWarn, setBookingWarn] = useState<string[] | null>(null);
  const [pauseConfirm, setPauseConfirm] = useState(false);

  const weeklyPersistInitialized = useRef(false);

  const refreshSessions = useCallback(async () => {
    const res = await fetch("/api/sessions/my-sessions");
    const data = (await res.json()) as { sessions?: typeof sessions };
    if (res.ok && Array.isArray(data.sessions)) setSessions(data.sessions);
    else setSessions([]);
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      const res = await fetch("/api/experts/availability");
      const data = (await res.json()) as { availability?: Record<string, unknown> | null; error?: string };
      if (cancelled) return;
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Could not load availability");
        setLoading(false);
        return;
      }
      const a = data.availability;
      if (!a) {
        setLoadOk(true);
        setLoading(false);
        weeklyPersistInitialized.current = false;
        return;
      }
      setWeekly(normalizeWeeklySchedule(a.weekly_schedule));
      setOverrides(parseOverrides(a.availability_overrides));
      setCalendarPaused(Boolean(a.calendar_paused));
      weeklyPersistInitialized.current = false;
      setLoadOk(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bookingCountByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sessions) {
      if (s.cancelled_at) continue;
      const st = String(s.status ?? "").toLowerCase();
      if (st === "cancelled") continue;
      const d = String(s.session_date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return m;
  }, [sessions]);

  const persistWeeklyMerge = useCallback(async (w: WeeklyScheduleState, o: Record<string, WeeklySlot[] | undefined>) => {
    setSaving(true);
    setErr(null);
    try {
      const getRes = await fetch("/api/experts/availability");
      const getData = (await getRes.json()) as { availability?: Record<string, unknown> | null; error?: string };
      if (!getRes.ok) {
        setErr(typeof getData.error === "string" ? getData.error : "Could not load availability");
        return;
      }
      const row = getData.availability ?? undefined;
      const dateOverrides = Object.entries(o)
        .filter(([, slots]) => slots != null)
        .map(([date, slots]) => ({ date, slots: slots ?? [] }));
      const body = availabilityRecordToPutBody(row, { weeklySchedule: w, dateOverrides });
      const putRes = await fetch("/api/experts/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const putData = (await putRes.json()) as { error?: string };
      if (!putRes.ok) {
        setErr(typeof putData.error === "string" ? putData.error : "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !loadOk) return;
    if (!weeklyPersistInitialized.current) {
      weeklyPersistInitialized.current = true;
      return;
    }
    const t = window.setTimeout(() => {
      void persistWeeklyMerge(weekly, overrides);
    }, 650);
    return () => window.clearTimeout(t);
  }, [weekly, overrides, loading, loadOk, persistWeeklyMerge]);

  const openModify = useCallback(
    (dates: string[]) => {
      const sorted = Array.from(new Set(dates)).sort();
      if (sorted.length === 0) return;
      if (sorted.length > 1) {
        const anySlots = sorted.some((d) => effectiveSlots(d, weekly, overrides).length > 0);
        if (anySlots) {
          setMultiDlg({ dates: sorted });
          return;
        }
      }
      setModifyDates(sorted);
      setEditSlots(initialEditorSlots(sorted, weekly, overrides));
      setModifyOpen(true);
    },
    [weekly, overrides],
  );

  useEffect(() => {
    const onUp = () => {
      if (!dragRef.current.anchor) return;
      dragRef.current.anchor = null;
      const dates = rangeRef.current;
      setDragHighlight([]);
      if (dates.length) void openModify(dates);
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [openModify]);

  const onDayPointerDown = (e: React.PointerEvent, dateIso: string) => {
    dragRef.current.anchor = dateIso;
    const r = enumerateRange(dateIso, dateIso);
    rangeRef.current = r;
    setDragHighlight(r);
  };

  const onDayPointerEnter = (dateIso: string) => {
    const a = dragRef.current.anchor;
    if (!a) return;
    const r = enumerateRange(a, dateIso);
    rangeRef.current = r;
    setDragHighlight(r);
  };

  const shiftMonth = (delta: number) => {
    setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  const confirmMarkUnavailable = () => {
    const dates = modifyDates;
    const hit = dates.filter((d) => (bookingCountByDate.get(d) ?? 0) > 0);
    if (hit.length) {
      setBookingWarn(dates);
      return;
    }
    applyMarkUnavailable(dates);
  };

  const applyMarkUnavailable = (dates: string[]) => {
    const next = { ...overrides };
    for (const d of dates) next[d] = [];
    setOverrides(next);
    setModifyOpen(false);
    setBookingWarn(null);
    void persistWeeklyMerge(weekly, next);
  };

  const applyModifyUpdate = () => {
    const next = { ...overrides };
    for (const d of modifyDates) {
      next[d] = editSlots.map((s) => ({ ...s }));
    }
    setOverrides(next);
    setModifyOpen(false);
    void persistWeeklyMerge(weekly, next);
  };

  const onPauseToggleClick = () => {
    if (!calendarPaused) setPauseConfirm(true);
    else void togglePause(false);
  };

  const togglePause = async (paused: boolean) => {
    const res = await fetch("/api/experts/availability", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarPaused: paused }),
    });
    const data = (await res.json()) as { error?: string; calendarPaused?: boolean };
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Could not update pause state");
      return;
    }
    setCalendarPaused(Boolean(data.calendarPaused));
    setPauseConfirm(false);
  };

  const cells = useMemo(() => calendarMonthCells(monthAnchor), [monthAnchor]);

  if (loading) {
    return (
      <div className={dashboardViewCardClass}>
        <p className="text-sm text-muted-foreground">Loading availability…</p>
      </div>
    );
  }

  if (!loadOk && err) {
    return (
      <div className={dashboardViewCardClass}>
        <p className="text-sm text-red-600">{err}</p>
      </div>
    );
  }

  return (
    <div className={dashboardViewCardClass}>
      {err ? <p className="mb-3 text-sm text-red-600">{err}</p> : null}
      <DashboardViewHeader
        Icon={Calendar}
        title="Availability Calendar"
        subtitle={
          <>
            <span className="block">
              Manage availability for specific days, drag to apply changes to multiple days.
            </span>
            <span className="mt-1 block">
              Note that changes will override recurring availability on specified days.
            </span>
          </>
        }
      />

      {calendarPaused ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
          Your availability is paused. Learners cannot book new sessions until you resume.
        </div>
      ) : null}

      <div className={`${dashboardViewContentBoxClass} mt-6`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-[#003049] sm:text-2xl">Update Recurring Availability</h2>
          {saving ? (
            <span className="text-xs font-medium text-[#003049]/55" aria-live="polite">
              Saving…
            </span>
          ) : null}
        </div>
        <div className="mt-4 overflow-x-auto">
          <WeeklyAvailabilityCalendar value={weekly} onChange={setWeekly} />
        </div>
      </div>

      <div className={`${dashboardViewContentBoxClass} mt-6`}>
        <h2 className="text-base font-bold text-[#003049]">Full Availability Calendar</h2>
        <p className="mt-1 text-sm font-medium text-[#003049]/65">
          Click a day to edit. Drag across days for a range. Days use your recurring pattern unless overridden.
        </p>

        <div className="mt-5 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 border-[#003049]/20"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="min-w-0 flex-1 text-center text-lg font-bold text-[#003049] sm:text-xl">
            {monthLabel(monthAnchor)}
          </h3>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 border-[#003049]/20"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-[#003049]/15">
          <div className="grid grid-cols-7 gap-px bg-[#003049]/15">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div
                key={d}
                className="bg-[#003049] py-2 text-center text-[11px] font-bold uppercase tracking-wide text-white"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-[#003049]/15 p-px">
            {cells.map((d) => {
              const dateIso = iso(d);
              const inMonth = d.getMonth() === monthAnchor.getMonth();
              const slotsN = effectiveSlots(dateIso, weekly, overrides).length;
              const bookN = bookingCountByDate.get(dateIso) ?? 0;
              const hilite = dragHighlight.includes(dateIso);
              return (
                <button
                  key={`${dateIso}-${inMonth}`}
                  type="button"
                  data-date={dateIso}
                  onPointerDown={(e) => onDayPointerDown(e, dateIso)}
                  onPointerEnter={() => onDayPointerEnter(dateIso)}
                  className={cn(
                    "flex min-h-[5.5rem] flex-col gap-1 p-1.5 text-left text-xs transition-colors",
                    inMonth ? "bg-[#003049]/[0.07] text-[#003049]" : "bg-white/90 text-[#003049]/40",
                    hilite && "ring-2 ring-inset ring-[#F77F00]",
                  )}
                >
                  <span className={cn("font-semibold tabular-nums", !inMonth && "text-[#003049]/45")}>
                    {d.getDate()}
                  </span>
                  {slotsN > 0 ? (
                    <span className="rounded border border-[#F77F00]/35 bg-[#FFF6EE] px-1 py-0.5 text-[10px] font-medium text-[#003049]">
                      Time Slots · {slotsN}
                    </span>
                  ) : (
                    <span className="rounded bg-[#003049]/10 px-1 py-0.5 text-[10px] font-medium text-[#003049]/55">
                      No slots
                    </span>
                  )}
                  {bookN > 0 ? (
                    <span className="rounded bg-[#F77F00]/15 px-1 py-0.5 text-[10px] font-medium text-[#003049]">
                      Bookings · {bookN}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={modifyOpen} onOpenChange={setModifyOpen}>
        <DialogContent className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Modify Availability</DialogTitle>
            <p className="text-sm font-medium text-muted-foreground">
              {modifyDates.length === 1
                ? formatDayHeading(modifyDates[0] ?? "")
                : `${modifyDates.length} days selected (${modifyDates[0] ?? ""} – ${modifyDates[modifyDates.length - 1] ?? ""})`}
            </p>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className={dashboardLabelClass}>Time slots</p>
              <ul className="mt-2 space-y-2">
                {editSlots.length === 0 ? (
                  <li className="text-sm text-muted-foreground">No slots yet. Add one below.</li>
                ) : (
                  editSlots.map((s, idx) => (
                    <li
                      key={`${s.start}-${s.end}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-md border border-[#003049]/10 px-3 py-2 text-sm"
                    >
                      <span className="tabular-nums">
                        {formatTimeSlotLabel12h(s.start)} – {formatTimeSlotLabel12h(s.end)}
                      </span>
                      <button
                        type="button"
                        className="text-sm font-medium text-red-600 underline"
                        onClick={() => setEditSlots((xs) => xs.filter((_, i) => i !== idx))}
                      >
                        Delete
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className={dashboardLabelClass}>Start time</p>
                <Select value={addStart} onValueChange={setAddStart}>
                  <SelectTrigger className="mt-1 border-[#003049]/15">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_OPTS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {formatTimeSlotLabel12h(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className={dashboardLabelClass}>End time</p>
                <Select value={addEnd} onValueChange={setAddEnd}>
                  <SelectTrigger className="mt-1 border-[#003049]/15">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_OPTS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {formatTimeSlotLabel12h(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full border-[#003049]/20"
              onClick={() => {
                if (addStart >= addEnd) {
                  window.alert("End time must be after start time.");
                  return;
                }
                setEditSlots((xs) => [...xs, { start: addStart, end: addEnd }]);
              }}
            >
              Add
            </Button>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              className="w-full bg-[#F77F00] font-semibold text-white hover:bg-[#F77F00]/90"
              onClick={() => void applyModifyUpdate()}
            >
              Update
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={() => void confirmMarkUnavailable()}
            >
              Mark as Unavailable
            </Button>
            {modifyDates.length === 1 ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  const d = modifyDates[0];
                  if (!d) return;
                  const next = { ...overrides };
                  delete next[d];
                  setOverrides(next);
                  setModifyOpen(false);
                  void persistWeeklyMerge(weekly, next);
                }}
              >
                Clear day override (use weekly schedule)
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-12 flex justify-end pb-8">
        <button
          type="button"
          className="text-sm font-semibold text-[#F77F00] underline underline-offset-2 hover:text-[#003049] disabled:opacity-50"
          disabled={saving}
          onClick={() => void onPauseToggleClick()}
        >
          {calendarPaused ? "Resume Availability" : "Pause All Availability"}
        </button>
      </div>

      <AlertDialog open={multiDlg != null} onOpenChange={(o) => !o && setMultiDlg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace availability for multiple days?</AlertDialogTitle>
            <AlertDialogDescription>
              You have selected multiple days with existing availability. Are you sure you want to delete the existing
              availability data and replace it for these days?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!multiDlg) return;
                const dates = multiDlg.dates;
                setMultiDlg(null);
                setModifyDates(dates);
                setEditSlots([]);
                setModifyOpen(true);
              }}
            >
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bookingWarn != null} onOpenChange={(o) => !o && setBookingWarn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Existing bookings on this day</AlertDialogTitle>
            <AlertDialogDescription>
              You have made yourself unavailable on a day with existing bookings. Note that this will prevent future
              bookings on this day, but not cancel the existing bookings. To cancel or reschedule existing bookings,
              please visit your dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!bookingWarn) return;
                applyMarkUnavailable(bookingWarn);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pauseConfirm} onOpenChange={setPauseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause availability?</AlertDialogTitle>
            <AlertDialogDescription>
              Pausing availability will hide all of your availability for future bookings. Note that any existing
              bookings will not be affected, please cancel or re-schedule as needed under Booked Sessions. You can
              re-start your calendar at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void togglePause(true)}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  type WeekdayKey,
  type WeeklyScheduleState,
  type WeeklySlot,
  buildTimeOptions,
  formatTimeSlotLabel12h,
  minutesToTimeString,
  timeToMinutes,
} from "./weeklyAvailabilityUtils";

const MULTI_DAY_GROUPS: WeekdayKey[][] = [
  ["monday", "tuesday", "wednesday"],
  ["thursday", "friday"],
  ["saturday", "sunday"],
];
import { cn } from "@/lib/utils";

export type { WeeklyScheduleState, WeeklySlot };

const PX_PER_MINUTE = 1.2;
const MINUTES_TOTAL = 24 * 60;
const GRID_HEIGHT_PX = MINUTES_TOTAL * PX_PER_MINUTE;
/** Must match day header cell (`h-10`). */
const DAY_HEADER_PX = 40;

const TIME_OPTIONS = buildTimeOptions();

/** Normalize HH:MM to HH:MM:SS for storage. */
function toDbTime(t: string): string {
  const s = t.trim().slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s.length >= 8 ? s.slice(0, 8) : `${s}:00`;
}

function slotMinutes(slot: WeeklySlot): { start: number; end: number } {
  const s = timeToMinutes(slot.start);
  let e = timeToMinutes(slot.end);
  if (e <= s) e = Math.min(24 * 60, s + 15);
  return { start: s, end: e };
}

type EditMode = "add" | "edit";

export function WeeklyAvailabilityCalendar({
  value,
  onChange,
}: {
  value: WeeklyScheduleState;
  onChange: (next: WeeklyScheduleState) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<EditMode>("add");
  const [editDay, setEditDay] = useState<WeekdayKey | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [multiDays, setMultiDays] = useState<WeekdayKey[]>([]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const nineAmPx = ((9 * 60) / MINUTES_TOTAL) * GRID_HEIGHT_PX;
      el.scrollTop = Math.max(0, nineAmPx - el.clientHeight / 2);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const openAdd = useCallback((day: WeekdayKey, clickMinutes?: number) => {
    setMode("add");
    setEditDay(day);
    setEditIndex(null);
    const anchor = clickMinutes != null ? clickMinutes : 9 * 60;
    const rounded = Math.round(anchor / 15) * 15;
    const s = Math.max(0, Math.min(24 * 60 - 30, rounded));
    setStartTime(minutesToTimeString(s));
    setEndTime(minutesToTimeString(Math.min(24 * 60 - 15, s + 60)));
    setMultiDays([day]);
    setOpen(true);
  }, []);

  const openEdit = useCallback(
    (day: WeekdayKey, index: number) => {
      const slot = value[day][index];
      if (!slot) return;
      setMode("edit");
      setEditDay(day);
      setEditIndex(index);
      setStartTime(slot.start.slice(0, 5));
      setEndTime(slot.end.slice(0, 5));
      setMultiDays([day]);
      setOpen(true);
    },
    [value],
  );

  const applySlot = useCallback(() => {
    const startM = timeToMinutes(startTime);
    let endM = timeToMinutes(endTime);
    if (endM <= startM) endM = startM + 15;
    const slot: WeeklySlot = {
      start: toDbTime(startTime),
      end: toDbTime(endTime),
    };

    const targets =
      mode === "edit" && editDay != null && editIndex != null
        ? [editDay]
        : multiDays.length > 0
          ? multiDays
          : editDay
            ? [editDay]
            : [];

    if (targets.length === 0) return;

    const next: WeeklyScheduleState = { ...value };
    for (const k of WEEKDAY_KEYS) {
      next[k] = [...value[k]];
    }

    if (mode === "edit" && editDay != null && editIndex != null) {
      next[editDay] = [...next[editDay]];
      next[editDay][editIndex] = slot;
    } else {
      for (const d of targets) {
        next[d] = [...next[d], slot].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
      }
    }

    onChange(next);
    setOpen(false);
  }, [editDay, editIndex, endTime, mode, multiDays, onChange, startTime, value]);

  const deleteSlot = useCallback(
    (day: WeekdayKey, index: number) => {
      const next: WeeklyScheduleState = { ...value };
      next[day] = next[day].filter((_, i) => i !== index);
      onChange(next);
    },
    [onChange, value],
  );

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let h = 0; h <= 24; h++) marks.push(h * 60);
    return marks;
  }, []);

  const hourLabels = useMemo(() => {
    const labels: { top: number; text: string }[] = [];
    for (let h = 0; h < 24; h++) {
      const m = h * 60;
      labels.push({
        top: (m / MINUTES_TOTAL) * GRID_HEIGHT_PX,
        text: formatTimeSlotLabel12h(minutesToTimeString(m)),
      });
    }
    return labels;
  }, []);

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-xl border border-[#003049]/15 bg-white">
        <div className="flex min-w-0 border-b border-[#003049]/20">
          <div
            className="w-11 shrink-0 rounded-tl-xl bg-white sm:w-12"
            style={{ height: DAY_HEADER_PX }}
            aria-hidden
          />
          {WEEKDAY_KEYS.map((day, i) => (
            <div
              key={`hdr-${day}`}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center border-l border-[#003049]/20 bg-[#003049] text-center text-[10px] font-bold uppercase tracking-wide text-white sm:text-xs",
                i === WEEKDAY_KEYS.length - 1 && "rounded-tr-xl",
              )}
              style={{ height: DAY_HEADER_PX }}
            >
              {WEEKDAY_LABELS[day]}
            </div>
          ))}
        </div>

        <div
          ref={scrollRef}
          className="overflow-y-auto overflow-x-hidden"
          style={{ height: 400 }}
        >
          <div className="flex min-w-0" style={{ height: GRID_HEIGHT_PX }}>
            <div className="relative w-11 shrink-0 bg-white sm:w-12" style={{ height: GRID_HEIGHT_PX }}>
              {hourLabels.map(({ top, text }) => (
                <div
                  key={`lbl-${text}-${top}`}
                  className="pointer-events-none absolute left-0 right-1.5 -translate-y-1/2 text-right text-[10px] font-medium leading-none text-[#003049]/60 sm:text-[11px]"
                  style={{ top }}
                >
                  {text}
                </div>
              ))}
            </div>

            <div className="flex min-w-0 flex-1">
              {WEEKDAY_KEYS.map((day) => (
                <div
                  key={day}
                  className="relative min-w-0 flex-1 cursor-crosshair border-l border-[#003049]/10 bg-[#003049]/[0.07] first:border-l-0"
                  style={{ height: GRID_HEIGHT_PX }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-slot-block]")) return;
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const mins = Math.round((y / rect.height) * (MINUTES_TOTAL / 15)) * 15;
                    openAdd(day, mins);
                  }}
                >
                  {hourMarks.map((m) => (
                    <div
                      key={`${day}-h-${m}`}
                      className="pointer-events-none absolute left-0 right-0 border-t border-[#003049]/12"
                      style={{ top: (m / MINUTES_TOTAL) * GRID_HEIGHT_PX }}
                    />
                  ))}
                  {value[day].map((slot, idx) => {
                    const { start, end } = slotMinutes(slot);
                    const top = (start / MINUTES_TOTAL) * GRID_HEIGHT_PX;
                    const h = Math.max(10, ((end - start) / MINUTES_TOTAL) * GRID_HEIGHT_PX);
                    const startL = formatTimeSlotLabel12h(slot.start);
                    const endL = formatTimeSlotLabel12h(slot.end);
                    return (
                      <div
                        key={`${slot.start}-${slot.end}-${idx}`}
                        data-slot-block
                        className="absolute left-0.5 right-0.5 z-10 rounded-md border border-[#003049]/25 bg-[#FFF6EE] px-1 py-0.5 shadow-sm"
                        style={{ top, height: h }}
                      >
                        <button
                          type="button"
                          className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-xs leading-none text-[#003049] hover:bg-red-50"
                          aria-label="Remove slot"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            deleteSlot(day, idx);
                          }}
                        >
                          ×
                        </button>
                        <button
                          type="button"
                          className="block w-full pr-5 text-left text-[10px] font-semibold leading-tight text-[#003049]"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            openEdit(day, idx);
                          }}
                        >
                          {startL} – {endL}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-left text-[#003049]">
              <Calendar className="h-5 w-5 shrink-0 text-[#F77F00]" strokeWidth={2} aria-hidden />
              <span>New Recurring Time Slot</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start time</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {formatTimeSlotLabel12h(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>End time</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {formatTimeSlotLabel12h(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Add to multiple days:</p>
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                {MULTI_DAY_GROUPS.map((group) => (
                  <div key={group.join("-")} className="flex flex-col gap-2">
                    {group.map((d) => (
                      <label key={d} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={multiDays.includes(d)}
                          onCheckedChange={(c) => {
                            setMultiDays((prev) => {
                              const on = Boolean(c);
                              if (on) return prev.includes(d) ? prev : [...prev, d];
                              return prev.filter((x) => x !== d);
                            });
                          }}
                        />
                        {WEEKDAY_LABELS[d]}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={applySlot}>
              {mode === "edit" ? "Save changes" : "Add availability"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

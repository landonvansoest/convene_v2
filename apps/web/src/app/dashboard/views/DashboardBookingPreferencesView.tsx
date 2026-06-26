"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, CheckCircle, Info, Loader2, Wand2 } from "lucide-react";
import {
  dashboardViewCardClass,
  dashboardViewContentBoxClass,
  DashboardViewHeader,
} from "@/app/dashboard/DashboardViewShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { availabilityRecordToPutBody } from "@/lib/expert-availability-dashboard";
import type { LucideIcon } from "lucide-react";

const SELECT_EMPTY = "__select__";

const MIN_BOOKING_OPTIONS = [
  { label: "15 min", value: "15" },
  { label: "30 min", value: "30" },
  { label: "45 min", value: "45" },
  { label: "1 hr", value: "60" },
  { label: "1.5 hrs", value: "90" },
  { label: "2 hrs", value: "120" },
];

const MAX_BOOKING_OPTIONS = [
  { label: "30 min", value: "30" },
  { label: "1 hr", value: "60" },
  { label: "2 hrs", value: "120" },
  { label: "3 hrs", value: "180" },
  { label: "4 hrs", value: "240" },
  { label: "6 hrs", value: "360" },
  { label: "8 hrs", value: "480" },
];

const MIN_NOTICE_OPTIONS = [
  { label: "None", value: "0" },
  { label: "5 min", value: "5" },
  { label: "10 min", value: "10" },
  { label: "15 min", value: "15" },
  { label: "20 min", value: "20" },
  { label: "30 min", value: "30" },
  { label: "1 hr", value: "60" },
  { label: "2 hrs", value: "120" },
  { label: "4 hrs", value: "240" },
  { label: "8 hrs", value: "480" },
  { label: "24 hrs", value: "1440" },
  { label: "48 hrs", value: "2880" },
];

const MAX_NOTICE_OPTIONS = [
  { label: "1 day", value: "1440" },
  { label: "3 days", value: "4320" },
  { label: "1 week", value: "10080" },
  { label: "2 weeks", value: "20160" },
  { label: "1 month", value: "43200" },
  { label: "3 months", value: "129600" },
  { label: "6 months", value: "259200" },
  { label: "1 year", value: "525600" },
];

const BUFFER_OPTIONS = [
  { label: "No buffer", value: "0" },
  { label: "5 min", value: "5" },
  { label: "10 min", value: "10" },
  { label: "15 min", value: "15" },
  { label: "30 min", value: "30" },
  { label: "1 hour", value: "60" },
];

const FIRST_SESSION_DURATION_OPTIONS = [
  { label: "15 min", value: "15" },
  { label: "30 min", value: "30" },
  { label: "45 min", value: "45" },
  { label: "1 hr", value: "60" },
  { label: "Any Length", value: "any" },
];

const PACKAGE_SESSION_DURATION_OPTIONS = [
  { label: "15 min", value: "15" },
  { label: "30 min", value: "30" },
  { label: "1 hr", value: "60" },
  { label: "2 hrs", value: "120" },
  { label: "4 hrs", value: "240" },
  { label: "8 hrs", value: "480" },
];

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#003049]/25 text-[#003049] hover:bg-[#003049]/5"
          aria-label="More information"
        >
          <Info className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px] text-left text-xs leading-snug">{text}</TooltipContent>
    </Tooltip>
  );
}

function WizardSectionHeading({ Icon, children }: { Icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h3 className="flex items-start gap-2.5 text-lg font-bold text-[#003049] sm:gap-3 sm:text-xl">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#F77F00] sm:h-6 sm:w-6" strokeWidth={2} aria-hidden />
      <span>{children}</span>
    </h3>
  );
}

const wizardSectionBodyClass =
  "mt-2 text-[13px] font-medium leading-snug text-[#003049]/90 sm:mt-2.5 sm:text-sm";
const manualInputClass =
  "h-9 text-[13px] leading-snug font-normal text-[#003049] placeholder:text-[#003049]";
const manualSelectTriggerClass =
  "h-9 text-[13px] leading-snug font-normal text-[#003049] px-2.5 [&_span[data-placeholder]]:text-[#003049]";

type Profile = Record<string, unknown> | null;

export default function DashboardBookingPreferencesView() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile>(null);

  const [rate, setRate] = useState("");
  const [minBook, setMinBook] = useState("");
  const [maxBook, setMaxBook] = useState("");
  const [minNotice, setMinNotice] = useState("");
  const [maxNotice, setMaxNotice] = useState("");
  const [buffer, setBuffer] = useState("");
  const [autoAccept, setAutoAccept] = useState(true);
  const [extendSessions, setExtendSessions] = useState(true);

  const [fsEnabled, setFsEnabled] = useState(false);
  const [fsType, setFsType] = useState<"percent" | "fixed_amount">("percent");
  const [fsValue, setFsValue] = useState("");
  const [fsMaxMin, setFsMaxMin] = useState("60");

  const [pkgEnabled, setPkgEnabled] = useState(false);
  const [pkgCount, setPkgCount] = useState("");
  const [pkgDur, setPkgDur] = useState("");
  const [pkgDiscType, setPkgDiscType] = useState<"percent" | "fixed_amount">("percent");
  const [pkgDiscVal, setPkgDiscVal] = useState("");
  const [pkgRequire, setPkgRequire] = useState(false);
  const [pkgRequireAfterFirst, setPkgRequireAfterFirst] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [saveSuccessOpen, setSaveSuccessOpen] = useState(false);

  const bookingPersistInitialized = useRef(false);

  function previewFirstSessionTotal(): string {
    const r = Number(rate);
    if (!fsEnabled || !Number.isFinite(r) || r <= 0) return "—";
    const v = Number(fsValue);
    if (fsMaxMin === "any") {
      if (fsType === "percent" && Number.isFinite(v)) {
        return `${Math.min(100, Math.max(0, v))}% off any session length`;
      }
      return "—";
    }
    const dur = Number(fsMaxMin);
    if (!Number.isFinite(dur) || dur <= 0) return "—";
    const base = (r / 15) * dur;
    if (fsType === "percent" && Number.isFinite(v)) {
      return `$${(base * (1 - Math.min(100, Math.max(0, v)) / 100)).toFixed(2)}`;
    }
    if (fsType === "fixed_amount" && Number.isFinite(v)) {
      return `$${Math.max(0, v).toFixed(2)}`;
    }
    return `$${base.toFixed(2)}`;
  }

  function previewPackageTotal(): string {
    const r = Number(rate);
    const sessions = Number(pkgCount);
    const dur = Number(pkgDur);
    if (!pkgEnabled || !Number.isFinite(r) || r <= 0 || !Number.isFinite(sessions) || sessions <= 0 || !Number.isFinite(dur) || dur <= 0) {
      return "—";
    }
    const base = sessions * (r / 15) * dur;
    const v = Number(pkgDiscVal);
    if (pkgDiscType === "percent" && Number.isFinite(v)) {
      return `$${(base * (1 - Math.min(100, Math.max(0, v)) / 100)).toFixed(2)}`;
    }
    if (pkgDiscType === "fixed_amount" && Number.isFinite(v)) {
      return `$${Math.max(0, v).toFixed(2)}`;
    }
    return `$${base.toFixed(2)}`;
  }

  const hydrateFromProfile = useCallback((p: Record<string, unknown>) => {
    setProfile(p);
    setRate(p.rate_per_15_min != null && p.rate_per_15_min !== "" ? String(p.rate_per_15_min) : "");
    setMinBook(
      p.minimum_booking_minutes != null && Number.isFinite(Number(p.minimum_booking_minutes))
        ? String(p.minimum_booking_minutes)
        : "",
    );
    setMaxBook(
      p.maximum_booking_minutes != null && Number.isFinite(Number(p.maximum_booking_minutes))
        ? String(p.maximum_booking_minutes)
        : "",
    );
    setMinNotice(
      p.minimum_notice_minutes != null && Number.isFinite(Number(p.minimum_notice_minutes))
        ? String(p.minimum_notice_minutes)
        : "",
    );
    setMaxNotice(
      p.maximum_notice_minutes != null && Number.isFinite(Number(p.maximum_notice_minutes))
        ? String(p.maximum_notice_minutes)
        : "",
    );
    setBuffer(
      p.buffer_time_minutes != null && Number.isFinite(Number(p.buffer_time_minutes))
        ? String(p.buffer_time_minutes)
        : "",
    );
    setAutoAccept(Boolean((p as { auto_accept?: boolean }).auto_accept ?? true));
    setExtendSessions(Boolean((p as { allow_session_extensions?: boolean }).allow_session_extensions ?? true));
    setFsEnabled(Boolean(p.first_session_discount_enabled));
    const fst = String((p as { first_session_discount_type?: string }).first_session_discount_type ?? "");
    setFsType(fst === "fixed_amount" ? "fixed_amount" : "percent");
    setFsValue(
      p.first_session_discount_value != null && p.first_session_discount_value !== ""
        ? String(p.first_session_discount_value)
        : "",
    );
    const fstMaxRaw = (p as { first_session_discount_max_session_minutes?: number | null })
      .first_session_discount_max_session_minutes;
    const fstOn = Boolean(p.first_session_discount_enabled);
    setFsMaxMin(
      fstMaxRaw == null && fstOn ? "any" : fstMaxRaw != null ? String(fstMaxRaw) : "60",
    );
    setPkgEnabled(Boolean((p as { package_deal_enabled?: boolean }).package_deal_enabled));
    setPkgCount(
      (p as { package_session_count?: number | null }).package_session_count != null
        ? String((p as { package_session_count?: number | null }).package_session_count)
        : "",
    );
    setPkgDur(
      (p as { package_session_duration_minutes?: number | null }).package_session_duration_minutes != null
        ? String((p as { package_session_duration_minutes?: number | null }).package_session_duration_minutes)
        : "",
    );
    const pdt = String((p as { package_discount_type?: string }).package_discount_type ?? "");
    setPkgDiscType(pdt === "fixed_amount" ? "fixed_amount" : "percent");
    setPkgDiscVal(
      (p as { package_discount_value?: number | null }).package_discount_value != null
        ? String((p as { package_discount_value?: number | null }).package_discount_value)
        : "",
    );
    setPkgRequire(Boolean((p as { package_require_purchase?: boolean }).package_require_purchase));
    setPkgRequireAfterFirst(
      Boolean(
        (p as { package_require_purchase_after_first_session?: boolean })
          .package_require_purchase_after_first_session,
      ),
    );
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch("/api/experts/registration-draft");
    const data = (await res.json()) as { profile?: Record<string, unknown> | null; error?: string };
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Could not load");
      return;
    }
    if (data.profile && typeof data.profile === "object") {
      hydrateFromProfile(data.profile);
    }
  }, [hydrateFromProfile]);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      await load();
      if (!c) setLoading(false);
    })();
    return () => {
      c = true;
    };
  }, [load]);

  const persist = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setErr(null);
    try {
      const getRes = await fetch("/api/experts/availability");
      const getData = (await getRes.json()) as { availability?: Record<string, unknown> | null; error?: string };
      if (!getRes.ok) {
        setErr(typeof getData.error === "string" ? getData.error : "Could not load availability");
        return false;
      }
      const row = getData.availability ?? undefined;
      const rateN = Number(rate);
      const body = availabilityRecordToPutBody(row, {
        ratePer15Min: Number.isFinite(rateN) && rateN >= 0 ? rateN : 0,
        minDuration: minBook ? Number(minBook) : undefined,
        maxDuration: maxBook ? Number(maxBook) : undefined,
        minimumNoticeMinutes: minNotice !== "" ? Number(minNotice) : undefined,
        maximumNoticeMinutes: maxNotice !== "" ? Number(maxNotice) : undefined,
        bufferTimeMinutes: buffer !== "" ? Number(buffer) : undefined,
        autoAccept,
        extendSessions,
        firstSessionDiscountEnabled: fsEnabled,
        firstSessionDiscountType: fsEnabled ? fsType : null,
        firstSessionDiscountValue: fsEnabled ? Number(fsValue || 0) : null,
        firstSessionDiscountMaxSessionMinutes: fsEnabled
          ? fsMaxMin === "any"
            ? null
            : Number(fsMaxMin)
          : null,
        firstSessionDiscountEffectiveFrom: null,
        firstSessionDiscountEffectiveUntil: null,
        packageDealEnabled: pkgEnabled,
        packageSessionCount: pkgEnabled && pkgCount ? Number(pkgCount) : null,
        packageSessionDurationMinutes: pkgEnabled && pkgDur ? Number(pkgDur) : null,
        packageDiscountType: pkgEnabled ? pkgDiscType : null,
        packageDiscountValue: pkgEnabled ? Number(pkgDiscVal || 0) : null,
        packageRequirePurchase: pkgEnabled ? pkgRequire : false,
        packageRequirePurchaseAfterFirst: pkgEnabled ? pkgRequireAfterFirst : false,
      });
      const putRes = await fetch("/api/experts/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const putData = (await putRes.json()) as { error?: string };
      if (!putRes.ok) {
        setErr(typeof putData.error === "string" ? putData.error : "Save failed");
        return false;
      }
      return true;
    } finally {
      setSaving(false);
    }
  }, [
    rate,
    minBook,
    maxBook,
    minNotice,
    maxNotice,
    buffer,
    autoAccept,
    extendSessions,
    fsEnabled,
    fsType,
    fsValue,
    fsMaxMin,
    pkgEnabled,
    pkgCount,
    pkgDur,
    pkgDiscType,
    pkgDiscVal,
    pkgRequire,
    pkgRequireAfterFirst,
  ]);

  async function handleSaveClick() {
    const ok = await persist();
    if (ok) setSaveSuccessOpen(true);
  }

  useEffect(() => {
    if (loading) return;
    if (!bookingPersistInitialized.current) {
      bookingPersistInitialized.current = true;
      return;
    }
    const t = window.setTimeout(() => {
      void persist();
    }, 700);
    return () => window.clearTimeout(t);
  }, [
    loading,
    persist,
    rate,
    minBook,
    maxBook,
    minNotice,
    maxNotice,
    buffer,
    autoAccept,
    extendSessions,
    fsEnabled,
    fsType,
    fsValue,
    fsMaxMin,
    pkgEnabled,
    pkgCount,
    pkgDur,
    pkgDiscType,
    pkgDiscVal,
    pkgRequire,
    pkgRequireAfterFirst,
  ]);

  async function suggestBooking() {
    const p = profile;
    if (!p) return;
    setGenerating(true);
    const quals = String(p.qualifications ?? "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 10);
    const res = await fetch("/api/expert-registration/generate/booking-preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profession: String(p.profession ?? ""),
        experienceLevel: String(p.experience_level ?? ""),
        qualifications: quals,
        ratePer15: Number(rate || 0),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { preferences?: Record<string, unknown> };
    const prefs = json.preferences ?? {};
    const suggestedRate = prefs.rate_per_15_min;
    if (suggestedRate != null && Number.isFinite(Number(suggestedRate)) && Number(suggestedRate) > 0) {
      setRate(String(Number(suggestedRate)));
    }
    if (prefs.minimum_booking_minutes != null) setMinBook(String(prefs.minimum_booking_minutes));
    if (prefs.maximum_booking_minutes != null) setMaxBook(String(prefs.maximum_booking_minutes));
    if (prefs.minimum_notice_minutes != null) setMinNotice(String(prefs.minimum_notice_minutes));
    if (prefs.maximum_notice_minutes != null) setMaxNotice(String(prefs.maximum_notice_minutes));
    if (prefs.buffer_time_minutes != null) setBuffer(String(prefs.buffer_time_minutes));
    if (prefs.auto_accept != null) setAutoAccept(Boolean(prefs.auto_accept));
    if (prefs.allow_session_extensions != null) setExtendSessions(Boolean(prefs.allow_session_extensions));
    setGenerating(false);
  }

  const fsAny = fsMaxMin === "any";
  const bookingSelectClass = cn(manualSelectTriggerClass, "w-full max-w-[220px]");
  const bookingInputClass = cn(manualInputClass, "max-w-[220px]");

  const rateTip =
    "convene bookings operate on 15-minute intervals. We suggest dividing your hourly rate by 4 and rounding up!";
  const minBookTip =
    "This is the shortest possible time for each booking. Note that users will be able to extend time in 15-minute increments based on your availability.";
  const maxBookTip =
    "The longest possible time for each booking. When users reach the maximum time period, the session will be concluded.";
  const minNoticeTip =
    "The amount of lead time you need from the time a booking is made to the start time of the session. Note that many users look for the “Next Available” Expert, so the sooner you make yourself available the more likely you are to get bookings.";
  const maxNoticeTip =
    "A personal preference for how long in advance you want to populate your calendar. Note that making changes or cancellations to bookings will impact your dependability rating, so we suggest setting a realistic period of time for future bookings.";
  const bufferTip =
    "Decide whether you need time to reset between bookings. Some experts like to leave time for a session to extend, others prefer to see learners back-to-back to maximize bookings.";
  const autoAcceptTip =
    "Allows users to book available time slots without your review. Note that users can only book according to your availability and settings. Experts who disable Auto-Accept typically receive far fewer bookings.";
  const extendTip =
    "If your availability allows, users will have the ability to extend a session in 15-minute increments during a session. Extensions will be billed according to your rate.";
  const discountFirstTooltip =
    "You can offer a First Session Discount either as a fixed time/price or as a percentage. Note that this setting will offer the discount to all users; you can also offer special discounts to individual users from your dashboard later.";
  const packageDealTooltip =
    "You can offer users a multi-session package either as an incentive, or as a requirement for your services. Note that after purchasing a package, users will receive credits for the specified number of sessions, and be required to schedule individually according to your availability.";
  const packageRequireTooltip =
    "Users will only be able to book you by purchasing a package.";
  const packageRequireAfterFirstTooltip =
    'This option allows you to offer an initial consultation before requiring users to book a package. Set parameters for the initial consultation under "Discount First Session" above.';

  if (loading) {
    return (
      <div className={dashboardViewCardClass}>
        <p className="text-sm text-muted-foreground">Loading booking preferences…</p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className={dashboardViewCardClass}>
        {err ? <p className="mb-3 text-sm text-red-600">{err}</p> : null}
        <DashboardViewHeader
          Icon={CalendarClock}
          title="Booking Preferences"
          subtitle={saving ? "Saving changes…" : "Preferences auto-save as you edit."}
        />

        <Dialog open={saveSuccessOpen} onOpenChange={setSaveSuccessOpen}>
          <DialogContent className="max-w-md">
            <div className="flex flex-col items-center space-y-4 py-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-convene-hero/15">
                <CheckCircle className="h-10 w-10 text-convene-hero" aria-hidden />
              </div>
              <DialogHeader>
                <DialogTitle className="text-2xl">Settings updated</DialogTitle>
                <DialogDescription className="text-base">
                  Your booking preferences have been saved and are now active for new bookings.
                </DialogDescription>
              </DialogHeader>
              <Button
                type="button"
                className="mt-2 w-full bg-[#003049] hover:bg-[#003049]/90"
                onClick={() => setSaveSuccessOpen(false)}
              >
                Done
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className={dashboardViewContentBoxClass}>
          <WizardSectionHeading Icon={CalendarClock}>Booking Preferences</WizardSectionHeading>
          <p className={wizardSectionBodyClass}>
            Set preferences for how users will be able to book your time. See tips for maximizing your success and feel
            free to use that{" "}
            <Wand2 className="inline-block h-3.5 w-3.5 align-[-2px] text-[#F77F00]" aria-hidden /> button to get started.
          </p>
          <div className="mt-5 space-y-5 sm:mt-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-bold uppercase tracking-wide text-[#003049]">Rate</Label>
                <InfoTip text={rateTip} />
              </div>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Booking Rate (per 15 min)"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className={bookingInputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wide text-[#003049]">Minimum Booking Duration</Label>
                  <InfoTip text={minBookTip} />
                </div>
                <Select
                  value={minBook || SELECT_EMPTY}
                  onValueChange={(v) => setMinBook(v === SELECT_EMPTY ? "" : v)}
                >
                  <SelectTrigger className={bookingSelectClass}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_EMPTY}>Select</SelectItem>
                    {MIN_BOOKING_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wide text-[#003049]">Maximum Booking Duration</Label>
                  <InfoTip text={maxBookTip} />
                </div>
                <Select
                  value={maxBook || SELECT_EMPTY}
                  onValueChange={(v) => setMaxBook(v === SELECT_EMPTY ? "" : v)}
                >
                  <SelectTrigger className={bookingSelectClass}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_EMPTY}>Select</SelectItem>
                    {MAX_BOOKING_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wide text-[#003049]">Minimum Booking Notice</Label>
                  <InfoTip text={minNoticeTip} />
                </div>
                <Select
                  value={minNotice === "" ? SELECT_EMPTY : minNotice}
                  onValueChange={(v) => setMinNotice(v === SELECT_EMPTY ? "" : v)}
                >
                  <SelectTrigger className={bookingSelectClass}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_EMPTY}>Select</SelectItem>
                    {MIN_NOTICE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wide text-[#003049]">Maximum Booking Notice</Label>
                  <InfoTip text={maxNoticeTip} />
                </div>
                <Select
                  value={maxNotice || SELECT_EMPTY}
                  onValueChange={(v) => setMaxNotice(v === SELECT_EMPTY ? "" : v)}
                >
                  <SelectTrigger className={bookingSelectClass}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_EMPTY}>Select</SelectItem>
                    {MAX_NOTICE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-bold uppercase tracking-wide text-[#003049]">Buffer Time</Label>
                <InfoTip text={bufferTip} />
              </div>
              <Select
                value={buffer === "" ? SELECT_EMPTY : buffer}
                onValueChange={(v) => setBuffer(v === SELECT_EMPTY ? "" : v)}
              >
                <SelectTrigger className={bookingSelectClass}>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_EMPTY}>Select</SelectItem>
                  {BUFFER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 text-sm font-normal text-[#003049] hover:text-[#F77F00] disabled:opacity-50"
                  onClick={() => void suggestBooking()}
                  disabled={generating}
                  aria-label="Suggest standard booking settings for your field"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#F77F00]" aria-hidden />
                  ) : (
                    <Wand2 className="h-4 w-4 shrink-0 text-[#F77F00]" aria-hidden />
                  )}
                </button>
                <span className="text-xs text-[#003049]/75 sm:text-[13px]">
                  Let us suggest standard booking settings for your field.
                </span>
              </div>
              <div className="mt-4">
                <p className="text-sm font-bold text-[#003049]">Advanced Options</p>
              </div>
            </div>

            <div className="space-y-5 pt-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold text-[#003049]">Auto-Accept Bookings</Label>
                    <InfoTip text={autoAcceptTip} />
                  </div>
                  <Switch checked={autoAccept} onCheckedChange={setAutoAccept} />
                </div>
                {!autoAccept ? (
                  <p className="text-xs font-medium leading-relaxed text-[#003049]/85">
                    By turning Auto-Accept Bookings off, you will be required to approve each individual booking on your
                    dashboard.
                  </p>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold text-[#003049]">Allow Session Extensions</Label>
                    <InfoTip text={extendTip} />
                  </div>
                  <Switch checked={extendSessions} onCheckedChange={setExtendSessions} />
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-semibold text-[#003049]">Discount First Session</Label>
                      <InfoTip text={discountFirstTooltip} />
                    </div>
                    <Switch checked={fsEnabled} onCheckedChange={setFsEnabled} />
                  </div>
                  {fsEnabled ? (
                    <div className="space-y-3 rounded-xl border border-[#003049]/15 bg-white p-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-[#003049]">Duration</Label>
                        <Select
                          value={fsMaxMin}
                          onValueChange={(v) => {
                            setFsMaxMin(v);
                            if (v === "any") setFsType("percent");
                          }}
                        >
                          <SelectTrigger className={cn(manualSelectTriggerClass, "max-w-[220px]")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIRST_SESSION_DURATION_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <RadioGroup
                        value={fsAny ? "percent" : fsType}
                        onValueChange={(v) => setFsType(v as "percent" | "fixed_amount")}
                        className="flex flex-wrap gap-4"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="fixed_amount" id="dash-fs-fixed" disabled={fsAny} />
                          <Label
                            htmlFor="dash-fs-fixed"
                            className={cn("text-sm font-normal", fsAny && "cursor-not-allowed opacity-50")}
                          >
                            Fixed Price
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="percent" id="dash-fs-pct" />
                          <Label htmlFor="dash-fs-pct" className="text-sm font-normal">
                            % Discount
                          </Label>
                        </div>
                      </RadioGroup>
                      <Input
                        placeholder={fsType === "percent" ? "Percent discount" : "Fixed price (USD)"}
                        value={fsValue}
                        onChange={(e) => setFsValue(e.target.value)}
                        className={manualInputClass}
                      />
                      <p className="text-xs font-medium text-[#003049]/80">Estimated total: {previewFirstSessionTotal()}</p>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-semibold text-[#003049]">Offer a Package</Label>
                      <InfoTip text={packageDealTooltip} />
                    </div>
                    <Switch checked={pkgEnabled} onCheckedChange={setPkgEnabled} />
                  </div>
                  {pkgEnabled ? (
                    <div className="space-y-3 rounded-xl border border-[#003049]/15 bg-white p-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-[#003049]">Number of sessions</Label>
                        <Input
                          type="number"
                          min={1}
                          placeholder="Number of sessions"
                          value={pkgCount}
                          onChange={(e) => setPkgCount(e.target.value)}
                          className={manualInputClass}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-[#003049]">Session Duration</Label>
                        <Select
                          value={pkgDur || SELECT_EMPTY}
                          onValueChange={(v) => setPkgDur(v === SELECT_EMPTY ? "" : v)}
                        >
                          <SelectTrigger className={cn(manualSelectTriggerClass, "max-w-[220px]")}>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SELECT_EMPTY}>Select</SelectItem>
                            {PACKAGE_SESSION_DURATION_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <RadioGroup
                        value={pkgDiscType}
                        onValueChange={(v) => setPkgDiscType(v as "percent" | "fixed_amount")}
                        className="flex flex-wrap gap-4"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="fixed_amount" id="dash-pkg-fixed" />
                          <Label htmlFor="dash-pkg-fixed" className="text-sm font-normal">
                            Fixed Price
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="percent" id="dash-pkg-pct" />
                          <Label htmlFor="dash-pkg-pct" className="text-sm font-normal">
                            % Discount
                          </Label>
                        </div>
                      </RadioGroup>
                      <Input
                        placeholder={pkgDiscType === "percent" ? "Percent discount" : "Fixed package price (USD)"}
                        value={pkgDiscVal}
                        onChange={(e) => setPkgDiscVal(e.target.value)}
                        className={manualInputClass}
                      />
                      <p className="text-xs font-medium text-[#003049]/80">Estimated package total: {previewPackageTotal()}</p>
                      <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-semibold text-[#003049]">Require Package Purchase</Label>
                          <InfoTip text={packageRequireTooltip} />
                        </div>
                        <Switch
                          checked={pkgRequire}
                          onCheckedChange={(v) => {
                            setPkgRequire(v);
                            if (v) setPkgRequireAfterFirst(false);
                          }}
                        />
                      </div>
                      <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-semibold text-[#003049]">
                            Require Package Purchase After First Session
                          </Label>
                          <InfoTip text={packageRequireAfterFirstTooltip} />
                        </div>
                        <Switch
                          checked={pkgRequireAfterFirst}
                          onCheckedChange={(v) => {
                            setPkgRequireAfterFirst(v);
                            if (v) setPkgRequire(false);
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

          <div className="mt-8 flex justify-end border-t border-[#003049]/10 pt-6">
            <Button
              type="button"
              className="min-w-[120px] bg-convene-hero text-white hover:bg-convene-hero/90"
              disabled={saving}
              onClick={() => void handleSaveClick()}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

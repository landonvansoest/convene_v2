"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  CalendarClock,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  Crown,
  Info,
  Loader2,
  MapPin,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { experienceLevels } from "@/lib/expert-registration";
import {
  genders,
  isoDateToUsDisplay,
  LANGUAGE_NONE,
  languages,
  maskUsDateDigitsFromInput,
  parseUsDateToIso,
} from "@/lib/profile/registration-profile";
import { WeeklyAvailabilityCalendar } from "@/components/expert/WeeklyAvailabilityCalendar";
import {
  BioGeneratorDialog,
  ServicesGeneratorDialog,
  SkillsSuggestionDialog,
} from "@/components/expert/ExpertSlide4GeneratorDialogs";
import { normalizeWeeklySchedule } from "@/components/expert/weeklyAvailabilityUtils";
import { ExpertPayoutInformationFields } from "@/components/expert/ExpertPayoutInformationFields";
import { VerifiedSubscriptionConsentDialog } from "@/components/expert/VerifiedSubscriptionConsentDialog";
import { VerifiedSubscriptionDialog } from "@/components/expert/VerifiedSubscriptionDialog";
import { validateExpertPayoutBankingDetails } from "@/lib/stripe/expertPayoutBankingValidation";

type Props = { heading?: string; subheading?: string };
type Category = { category_id: string; name: string };

const slideCount = 9;
/** Seven numbered wizard steps after intro; review (step 9) is not counted as an extra step. */
const WIZARD_STEP_COUNT = 7;

const manualInputClass =
  "h-9 text-[13px] leading-snug font-normal text-[#003049] placeholder:text-[#003049]";
const manualTextareaClass =
  "min-h-[88px] text-[13px] leading-snug font-normal text-[#003049] placeholder:text-[#003049]";
const manualSelectTriggerClass =
  "h-9 text-[13px] leading-snug font-normal text-[#003049] px-2.5 [&_span[data-placeholder]]:text-[#003049]";

const wizardSectionBodyClass =
  "mt-2 text-[13px] font-medium leading-snug text-[#003049]/90 sm:mt-2.5 sm:text-sm";

const bookingInformationBodyText =
  "convene will calculate your time zone based on your hometown. Note that all booking information will be displayed in your hometown's time zone.";

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

const SELECT_EMPTY = "__select__";

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

function parseQualificationsFromList(s: string): string[] {
  return s.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 10);
}

/** While focused, birthday is `birthdayDraft` (US text); blurred `state.birthday` is ISO. Same rules as learner signup. */
function mergeExpertBirthdayDraft(draft: string | null, committedIso: string): string {
  if (draft === null) return committedIso;
  const raw = draft.trim();
  if (!raw) return "";
  const iso = parseUsDateToIso(raw);
  if (iso) return iso;
  return committedIso;
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#003049]/25 text-[#003049] hover:bg-[#003049]/5" aria-label="More information">
          <Info className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px] text-left text-xs leading-snug">{text}</TooltipContent>
    </Tooltip>
  );
}

function WizardSectionHeading({ Icon, children }: { Icon: LucideIcon; children: ReactNode }) {
  return (
    <h3 className="flex items-start gap-2.5 text-lg font-bold text-[#003049] sm:gap-3 sm:text-xl">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#F77F00] sm:h-6 sm:w-6" strokeWidth={2} aria-hidden />
      <span>{children}</span>
    </h3>
  );
}

type FormState = {
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  hometown: string;
  time_zone: string;
  profession: string;
  profile_photo: string | null;
  language: string;
  introduction: string;
  birthday: string;
  gender: string;
  category_id: string;
  experience_level: string;
  qualification_items: string[];
  expert_bio: string;
  about_services: string;
  skills_specializations: string[];
  rate_per_15_min: string;
  minimum_booking_minutes: string;
  maximum_booking_minutes: string;
  minimum_notice_minutes: string;
  maximum_notice_minutes: string;
  buffer_time_minutes: string;
  auto_accept: boolean;
  allow_session_extensions: boolean;
  first_session_discount_enabled: boolean;
  first_session_discount_type: "percent" | "fixed_amount";
  first_session_discount_value: string;
  first_session_discount_max_session_minutes: string;
  package_deal_enabled: boolean;
  package_session_count: string;
  package_session_duration_minutes: string;
  package_discount_type: "percent" | "fixed_amount";
  package_discount_value: string;
  package_require_purchase: boolean;
  weekly_schedule: Record<string, Array<{ start: string; end: string }>>;
  membership_tier: "free" | "verified" | "enterprise";
  stripe_connect_account_id: string;
  payout_details: {
    legal_name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    routing_number: string;
    account_number: string;
    tax_id_last4: string;
  };
};

const defaults: FormState = {
  email: "",
  first_name: "",
  last_name: "",
  phone_number: "",
  hometown: "",
  time_zone: "UTC",
  profession: "",
  profile_photo: null,
  language: LANGUAGE_NONE,
  introduction: "",
  birthday: "",
  gender: "",
  category_id: "",
  experience_level: "",
  qualification_items: [],
  expert_bio: "",
  about_services: "",
  skills_specializations: [],
  rate_per_15_min: "",
  minimum_booking_minutes: "",
  maximum_booking_minutes: "",
  minimum_notice_minutes: "",
  maximum_notice_minutes: "",
  buffer_time_minutes: "",
  auto_accept: true,
  allow_session_extensions: true,
  first_session_discount_enabled: false,
  first_session_discount_type: "percent",
  first_session_discount_value: "",
  first_session_discount_max_session_minutes: "60",
  package_deal_enabled: false,
  package_session_count: "",
  package_session_duration_minutes: "",
  package_discount_type: "percent",
  package_discount_value: "",
  package_require_purchase: false,
  weekly_schedule: {},
  membership_tier: "free",
  stripe_connect_account_id: "",
  payout_details: {
    legal_name: "",
    address_line1: "",
    city: "",
    state: "",
    postal_code: "",
    country: "US",
    routing_number: "",
    account_number: "",
    tax_id_last4: "",
  },
};

const requiredFieldRingClass = "border-2 border-[#F77F00] ring-2 ring-[#F77F00]/25";

function RequiredFieldHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="mt-1 text-xs font-medium text-[#F77F00]" role="alert">
      required field
    </p>
  );
}

type MeBootstrapJson = { user?: { email?: string | null } | null; profile?: Record<string, unknown> | null };

function buildFormStateFromDraftProfile(p: Record<string, unknown>): FormState {
  const experience = String(p.experience_level ?? "");
  const fstType = String((p as { first_session_discount_type?: string }).first_session_discount_type ?? "");
  const fstEnabled = Boolean((p as { first_session_discount_enabled?: boolean }).first_session_discount_enabled);
  const fstMaxRaw = (p as { first_session_discount_max_session_minutes?: number | null })
    .first_session_discount_max_session_minutes;
  const fstMaxStr =
    fstMaxRaw == null && fstEnabled ? "any" : fstMaxRaw != null ? String(fstMaxRaw) : "60";
  const numOrEmpty = (v: unknown) =>
    v != null && v !== "" && Number.isFinite(Number(v)) ? String(v) : "";

  return {
    ...defaults,
    email: String(p.email ?? ""),
    first_name: String(p.first_name ?? ""),
    last_name: String(p.last_name ?? ""),
    phone_number: String(p.phone_number ?? ""),
    hometown: String(p.hometown ?? ""),
    time_zone: String(p.time_zone ?? "UTC") || "UTC",
    profession: String(p.profession ?? ""),
    profile_photo: (p.profile_photo as string | null) ?? null,
    language: (() => {
      const lang = p.language;
      return lang != null && String(lang).trim() ? String(lang) : LANGUAGE_NONE;
    })(),
    // users.introduction and expert_profiles.expert_bio are different columns — do not cross-fill
    introduction: String(p.introduction ?? "").trim(),
    birthday: p.birthday ? String(p.birthday).slice(0, 10) : "",
    gender: String(p.gender ?? ""),
    category_id: String(p.category_id ?? ""),
    experience_level: experienceLevels.includes(experience as (typeof experienceLevels)[number]) ? experience : "",
    qualification_items: parseQualificationsFromList(String(p.qualifications ?? "")),
    expert_bio: String(p.expert_bio ?? ""),
    about_services: String(p.about_services ?? ""),
    skills_specializations: Array.isArray(p.skills_specializations)
      ? (p.skills_specializations as string[]).filter((x) => typeof x === "string")
      : [],
    rate_per_15_min: numOrEmpty(p.rate_per_15_min),
    minimum_booking_minutes: numOrEmpty((p as { minimum_booking_minutes?: number | null }).minimum_booking_minutes),
    maximum_booking_minutes: numOrEmpty((p as { maximum_booking_minutes?: number | null }).maximum_booking_minutes),
    minimum_notice_minutes: numOrEmpty((p as { minimum_notice_minutes?: number | null }).minimum_notice_minutes),
    maximum_notice_minutes: numOrEmpty((p as { maximum_notice_minutes?: number | null }).maximum_notice_minutes),
    buffer_time_minutes: numOrEmpty((p as { buffer_time_minutes?: number | null }).buffer_time_minutes),
    auto_accept: Boolean((p as { auto_accept?: boolean }).auto_accept ?? true),
    allow_session_extensions: Boolean((p as { allow_session_extensions?: boolean }).allow_session_extensions ?? true),
    first_session_discount_enabled: fstEnabled,
    first_session_discount_type:
      fstType === "fixed_amount" || fstType === "percent" ? fstType : "percent",
    first_session_discount_value: String(
      (p as { first_session_discount_value?: number | null }).first_session_discount_value ?? "",
    ),
    first_session_discount_max_session_minutes: fstMaxStr,
    package_deal_enabled: Boolean((p as { package_deal_enabled?: boolean }).package_deal_enabled),
    package_session_count: String((p as { package_session_count?: number | null }).package_session_count ?? ""),
    package_session_duration_minutes: String(
      (p as { package_session_duration_minutes?: number | null }).package_session_duration_minutes ?? "",
    ),
    package_discount_type:
      (p as { package_discount_type?: string }).package_discount_type === "fixed_amount" ? "fixed_amount" : "percent",
    package_discount_value: String((p as { package_discount_value?: number | null }).package_discount_value ?? ""),
    package_require_purchase: Boolean((p as { package_require_purchase?: boolean }).package_require_purchase),
    weekly_schedule: normalizeWeeklySchedule(p.weekly_schedule),
    /** Default to free on load; user chooses Verified / Enterprise on the Plan step. */
    membership_tier: "free",
    stripe_connect_account_id: String(
      (p as { stripe_connect_account_id?: string | null }).stripe_connect_account_id ?? "",
    ).trim(),
    payout_details: (() => {
      const raw = (p as { payout_details?: Record<string, unknown> | null }).payout_details;
      const o = raw && typeof raw === "object" ? raw : {};
      return {
        legal_name: String(o.legal_name ?? ""),
        address_line1: String(o.address_line1 ?? ""),
        city: String(o.city ?? ""),
        state: String(o.state ?? ""),
        postal_code: String(o.postal_code ?? ""),
        country: String(o.country ?? "US"),
        routing_number: String(o.routing_number ?? ""),
        account_number: String(o.account_number ?? ""),
        tax_id_last4: String(o.tax_id_last4 ?? ""),
      };
    })(),
  };
}

function augmentFormStateFromMe(base: FormState, meJson: MeBootstrapJson): FormState {
  const prof = meJson.profile;
  const authEmail =
    meJson.user?.email != null && String(meJson.user.email).trim() !== ""
      ? String(meJson.user.email)
      : null;

  const next = { ...base };
  if (authEmail) next.email = authEmail;
  if (!prof || typeof prof !== "object") return next;

  const fill = (draft: string, key: string) => {
    if (draft.trim() !== "") return draft;
    const v = prof[key];
    if (v == null) return draft;
    const s = String(v).trim();
    return s !== "" ? String(v) : draft;
  };

  next.first_name = fill(next.first_name, "first_name");
  next.last_name = fill(next.last_name, "last_name");
  next.phone_number = fill(next.phone_number, "phone_number");
  next.hometown = fill(next.hometown, "hometown");
  next.profession = fill(next.profession, "profession");
  next.time_zone = fill(next.time_zone, "time_zone") || "UTC";

  const photo = prof.profile_photo;
  if (photo != null && typeof photo === "string" && photo.trim() && !next.profile_photo) {
    next.profile_photo = photo;
  }

  const plang = prof.language;
  if (plang != null && String(plang).trim() && (next.language === LANGUAGE_NONE || !next.language.trim())) {
    next.language = String(plang);
  }
  const pint = prof.introduction;
  if (pint != null && String(pint).trim() && !next.introduction.trim()) {
    next.introduction = String(pint);
  }
  const pbd = prof.birthday;
  if (pbd && !next.birthday.trim()) {
    next.birthday = String(pbd).slice(0, 10);
  }
  const pg = prof.gender;
  if (pg != null && String(pg).trim() && !next.gender.trim()) {
    next.gender = String(pg);
  }

  return next;
}

function validateStepFields(
  st: number,
  s: FormState,
  categorySuggestion: string,
  opts?: { payoutDevSkipped?: boolean },
): string[] {
  const f: string[] = [];
  switch (st) {
    case 2:
      if (!s.first_name.trim()) f.push("first_name");
      if (!s.last_name.trim()) f.push("last_name");
      if (!s.email.trim()) f.push("email");
      if (!s.hometown.trim()) f.push("hometown");
      if (!s.time_zone.trim()) f.push("time_zone");
      return f;
    case 3:
      if (!s.profession.trim()) f.push("profession");
      if (!s.category_id || s.category_id === "__none__") f.push("category_id");
      if (s.category_id === "__other__" && !categorySuggestion.trim()) f.push("category_suggestion");
      if (!s.experience_level || s.experience_level === "__none__") f.push("experience_level");
      if (s.qualification_items.length === 0) f.push("qualification_items");
      return f;
    case 4:
      if (!s.expert_bio.trim()) f.push("expert_bio");
      if (s.skills_specializations.length === 0) f.push("skills_specializations");
      return f;
    case 5: {
      const rate = Number(s.rate_per_15_min);
      if (!s.rate_per_15_min.trim() || !Number.isFinite(rate) || rate <= 0) f.push("rate_per_15_min");
      if (!s.minimum_booking_minutes || s.minimum_booking_minutes === SELECT_EMPTY) {
        f.push("minimum_booking_minutes");
      }
      if (!s.maximum_booking_minutes || s.maximum_booking_minutes === SELECT_EMPTY) {
        f.push("maximum_booking_minutes");
      }
      if (s.minimum_notice_minutes === "" || s.minimum_notice_minutes === SELECT_EMPTY) {
        f.push("minimum_notice_minutes");
      }
      if (!s.maximum_notice_minutes || s.maximum_notice_minutes === SELECT_EMPTY) {
        f.push("maximum_notice_minutes");
      }
      if (s.buffer_time_minutes === "" || s.buffer_time_minutes === SELECT_EMPTY) {
        f.push("buffer_time_minutes");
      }
      return f;
    }
    case 6: {
      const sched = normalizeWeeklySchedule(s.weekly_schedule);
      const has = Object.values(sched).some((slots) => slots.length > 0);
      if (!has) f.push("weekly_schedule");
      return f;
    }
    case 7: {
      if (opts?.payoutDevSkipped) return [];
      const v = validateExpertPayoutBankingDetails(s.phone_number, {
        legal_name: s.payout_details.legal_name,
        address_line1: s.payout_details.address_line1,
        city: s.payout_details.city,
        state: s.payout_details.state,
        postal_code: s.payout_details.postal_code,
        country: s.payout_details.country,
        routing_number: s.payout_details.routing_number,
        account_number: s.payout_details.account_number,
        tax_id_last4: s.payout_details.tax_id_last4,
      });
      return v.ok ? [] : [...v.fields];
    }
    case 8:
      if (!s.membership_tier) f.push("membership_tier");
      return f;
    default:
      return f;
  }
}

/** Stable JSON of fields shown on a wizard step — used to skip PATCH when "Continue" if nothing on this step changed. */
function getWizardStepSnapshotJson(st: number, s: FormState, categorySuggestion: string): string {
  switch (st) {
    case 2:
      return JSON.stringify({
        profile_photo: s.profile_photo,
        first_name: s.first_name,
        last_name: s.last_name,
        phone_number: s.phone_number,
        hometown: s.hometown,
        time_zone: s.time_zone,
        language: s.language,
        birthday: s.birthday,
        gender: s.gender,
      });
    case 3:
      return JSON.stringify({
        profession: s.profession,
        category_id: s.category_id,
        experience_level: s.experience_level,
        qualification_items: s.qualification_items,
        category_suggestion: categorySuggestion,
      });
    case 4:
      return JSON.stringify({
        expert_bio: s.expert_bio,
        about_services: s.about_services,
        skills_specializations: s.skills_specializations,
      });
    case 5:
      return JSON.stringify({
        rate_per_15_min: s.rate_per_15_min,
        minimum_booking_minutes: s.minimum_booking_minutes,
        maximum_booking_minutes: s.maximum_booking_minutes,
        minimum_notice_minutes: s.minimum_notice_minutes,
        maximum_notice_minutes: s.maximum_notice_minutes,
        buffer_time_minutes: s.buffer_time_minutes,
        auto_accept: s.auto_accept,
        allow_session_extensions: s.allow_session_extensions,
        first_session_discount_enabled: s.first_session_discount_enabled,
        first_session_discount_type: s.first_session_discount_type,
        first_session_discount_value: s.first_session_discount_value,
        first_session_discount_max_session_minutes: s.first_session_discount_max_session_minutes,
        package_deal_enabled: s.package_deal_enabled,
        package_session_count: s.package_session_count,
        package_session_duration_minutes: s.package_session_duration_minutes,
        package_discount_type: s.package_discount_type,
        package_discount_value: s.package_discount_value,
        package_require_purchase: s.package_require_purchase,
      });
    case 6:
      return JSON.stringify({ weekly_schedule: normalizeWeeklySchedule(s.weekly_schedule) });
    case 7:
      return JSON.stringify({ phone_number: s.phone_number, payout_details: s.payout_details });
    case 8:
      return JSON.stringify({ membership_tier: s.membership_tier });
    default:
      return "";
  }
}

export function ExpertRegistrationForm({
  heading = "Expert registration",
  subheading = "Tell us about your practice. Submissions are reviewed before you appear in search.",
}: Props) {
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(true);
  const [step, setStep] = useState(1);
  const stepRef = useRef(step);
  stepRef.current = step;
  const [categories, setCategories] = useState<Category[]>([]);
  const [state, setState] = useState<FormState>(defaults);
  const [skillsInput, setSkillsInput] = useState("");
  const [qualInput, setQualInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  /** True after "Submit Expert Profile" through final draft save, API submit, and client navigation (avoids closing the wizard before the dashboard loads). */
  const [submittingToDashboard, setSubmittingToDashboard] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const uploadFileRef = useRef<HTMLInputElement | null>(null);
  const captureFileRef = useRef<HTMLInputElement | null>(null);
  const hometownWizardRef = useRef<HTMLInputElement | null>(null);
  const mapsConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim());

  const [categorySuggestion, setCategorySuggestion] = useState("");
  /** US `mm/dd/yyyy` while focused; ISO in `state.birthday` when blurred (matches learner signup). */
  const [birthdayFieldFocused, setBirthdayFieldFocused] = useState(false);
  const [birthdayDraft, setBirthdayDraft] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const categorySuggestionRef = useRef(categorySuggestion);
  categorySuggestionRef.current = categorySuggestion;
  /** Snapshot of `getWizardStepSnapshotJson` when the user landed on each step (used to skip redundant saves). */
  const stepEntrySnapshotRef = useRef<Record<number, string>>({});
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false);
  const [payoutDevSkipped, setPayoutDevSkipped] = useState(false);
  const [allowPayoutFormDevBypass, setAllowPayoutFormDevBypass] = useState(false);

  const fieldInvalid = (key: string) => invalidFields.includes(key);
  const clearFieldInvalid = (key: string) => {
    setInvalidFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev));
  };

  const progressStepIndex =
    step >= 2 && step <= 8 ? Math.min(WIZARD_STEP_COUNT, Math.max(1, step - 1)) : step === 9 ? WIZARD_STEP_COUNT : 1;
  const percentComplete =
    step === 9 ? 100 : step >= 2 && step <= 8 ? Math.round(((step - 1) / WIZARD_STEP_COUNT) * 100) : 0;

  const [enterpriseInquiryOpen, setEnterpriseInquiryOpen] = useState(false);
  const [enterpriseSending, setEnterpriseSending] = useState(false);
  const [enterpriseForm, setEnterpriseForm] = useState({
    message: "",
    coach_count: "",
    best_time: "",
    email: "",
    phone: "",
  });
  const [verifiedConsentOpen, setVerifiedConsentOpen] = useState(false);
  const [verifiedSubscriptionOpen, setVerifiedSubscriptionOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const [catRes, draftRes, meRes, devToolsRes] = await Promise.all([
        fetch("/api/categories", { cache: "no-store" }),
        fetch("/api/experts/registration-draft", { cache: "no-store" }),
        fetch("/api/me", { cache: "no-store" }),
        fetch("/api/dev-tools/public", { cache: "no-store" }),
      ]);
      const catJson = await catRes.json().catch(() => ({}));
      setCategories((catJson.categories as Category[]) ?? []);
      const devToolsJson = (await devToolsRes.json().catch(() => ({}))) as {
        enabled?: { payment_bypass_session?: boolean };
      };
      setAllowPayoutFormDevBypass(
        Boolean(devToolsJson.enabled?.payment_bypass_session) ||
          process.env.NEXT_PUBLIC_ALLOW_PAYOUT_FORM_BYPASS === "true",
      );
      const draftJson = await draftRes.json().catch(() => ({}));
      const meJson = (await meRes.json().catch(() => ({}))) as MeBootstrapJson;

      let nextState: FormState = { ...defaults };
      if (draftRes.ok && draftJson.profile) {
        nextState = buildFormStateFromDraftProfile(draftJson.profile as Record<string, unknown>);
      }
      if (meRes.ok) {
        nextState = augmentFormStateFromMe(nextState, meJson);
      }
      setState(nextState);
      const s = stepRef.current;
      if (s >= 2 && s <= 8) {
        stepEntrySnapshotRef.current[s] = getWizardStepSnapshotJson(
          s,
          nextState,
          categorySuggestionRef.current,
        );
      }
    })();
  }, []);

  useEffect(() => {
    if (step < 2 || step > 8) return;
    stepEntrySnapshotRef.current[step] = getWizardStepSnapshotJson(
      step,
      stateRef.current,
      categorySuggestionRef.current,
    );
  }, [step]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    if ((window as { google?: { maps?: { places?: { Autocomplete?: unknown } } } }).google?.maps?.places?.Autocomplete) {
      return;
    }
    const id = "google-maps-places-script-expert-registration";
    if (document.getElementById(id)) return;
    const script = document.createElement("script");
    script.id = id;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!mapsConfigured) return;
    const g = (window as unknown as { google?: { maps?: { places?: { Autocomplete?: unknown } } } }).google;
    const AutocompleteCtor = g?.maps?.places?.Autocomplete as
      | (new (
          input: HTMLInputElement,
          opts: { types: string[]; fields: string[] }
        ) => {
          addListener: (event: string, cb: () => void) => void;
          getPlace: () => {
            formatted_address?: string;
            name?: string;
            geometry?: {
              location?: {
                lat: (() => number) | number;
                lng: (() => number) | number;
              };
            };
          };
        })
      | undefined;
    if (!AutocompleteCtor) return;
    const el = hometownWizardRef.current;
    if (!el || (el as HTMLInputElement & { __convenePlacesAttached?: boolean }).__convenePlacesAttached) return;
    (el as HTMLInputElement & { __convenePlacesAttached?: boolean }).__convenePlacesAttached = true;
    const ac = new AutocompleteCtor(el, {
      types: ["(cities)"],
      fields: ["formatted_address", "name", "geometry"],
    });
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      const label = place.formatted_address || place.name || "";
      if (label) {
        setInvalidFields((prev) => (prev.includes("hometown") ? prev.filter((k) => k !== "hometown") : prev));
        setState((s) => ({ ...s, hometown: label }));
      }
      const loc = place.geometry?.location;
      if (!loc) return;
      const lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
      const lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!key) return;
      void (async () => {
        const ts = Math.floor(Date.now() / 1000);
        const r = await fetch(
          `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${ts}&key=${key}`
        );
        const j = (await r.json()) as { status?: string; timeZoneId?: string };
        if (j.status === "OK" && j.timeZoneId) {
          setState((s) => ({ ...s, time_zone: j.timeZoneId ?? s.time_zone }));
        }
      })();
    });
  });

  function commitBirthdayDraftIfNeeded(): FormState {
    if (birthdayDraft === null) return state;
    const merged = mergeExpertBirthdayDraft(birthdayDraft, state.birthday);
    setBirthdayDraft(null);
    setBirthdayFieldFocused(false);
    setState((prev) => ({ ...prev, birthday: merged }));
    return { ...state, birthday: merged };
  }

  function flushExpertBirthdayDraft() {
    if (birthdayDraft === null) return;
    const raw = birthdayDraft.trim();
    setBirthdayDraft(null);
    setBirthdayFieldFocused(false);
    if (!raw) {
      setState((s) => ({ ...s, birthday: "" }));
      return;
    }
    const iso = parseUsDateToIso(raw);
    if (iso) setState((s) => ({ ...s, birthday: iso }));
  }

  async function saveDraft(nextStep?: number, options?: { omitPayout?: boolean; mergedSnapshot?: FormState }) {
    setSaving(true);
    setError(null);
    const st = options?.mergedSnapshot ?? commitBirthdayDraftIfNeeded();
    const qualText = st.qualification_items.join("\n");
    const fstVal = st.first_session_discount_value.trim();
    const fstValNum = fstVal === "" ? null : Number(fstVal);
    const safeRate = Number(st.rate_per_15_min);
    const safeMinBooking = Number(st.minimum_booking_minutes);
    const safeMaxBooking = Number(st.maximum_booking_minutes);
    const safeMinNotice = Number(st.minimum_notice_minutes);
    const safeMaxNotice = Number(st.maximum_notice_minutes);
    const safeBuffer = Number(st.buffer_time_minutes);

    const bookingComplete =
      st.rate_per_15_min.trim() !== "" &&
      Number.isFinite(safeRate) &&
      safeRate > 0 &&
      st.minimum_booking_minutes !== "" &&
      st.minimum_booking_minutes !== SELECT_EMPTY &&
      st.maximum_booking_minutes !== "" &&
      st.maximum_booking_minutes !== SELECT_EMPTY &&
      st.minimum_notice_minutes !== "" &&
      st.minimum_notice_minutes !== SELECT_EMPTY &&
      st.maximum_notice_minutes !== "" &&
      st.maximum_notice_minutes !== SELECT_EMPTY &&
      st.buffer_time_minutes !== "" &&
      st.buffer_time_minutes !== SELECT_EMPTY;

    const fstMax =
      st.first_session_discount_enabled && st.first_session_discount_max_session_minutes === "any"
        ? null
        : st.first_session_discount_enabled
          ? Number(st.first_session_discount_max_session_minutes) || null
          : null;

    const pkgCount = st.package_session_count.trim();
    const pkgCountNum = pkgCount === "" ? null : Number(pkgCount);
    const pkgDur = st.package_session_duration_minutes.trim();
    const pkgDurNum = pkgDur === "" ? null : Number(pkgDur);
    const pkgDisc = st.package_discount_value.trim();
    const pkgDiscNum = pkgDisc === "" ? null : Number(pkgDisc);

    const introductionForUsers = st.introduction.trim() || null;
    const payload: Record<string, unknown> = {
      first_name: st.first_name.trim(),
      last_name: st.last_name.trim(),
      phone_number: st.phone_number.trim() || null,
      hometown: st.hometown.trim() || null,
      time_zone: st.time_zone.trim() || null,
      profession: st.profession.trim() || null,
      profile_photo: st.profile_photo || null,
      language:
        !st.language.trim() || st.language === LANGUAGE_NONE ? null : st.language.trim(),
      introduction: introductionForUsers,
      birthday:
        st.birthday.trim() === ""
          ? null
          : /^\d{4}-\d{2}-\d{2}$/.test(st.birthday.trim())
            ? st.birthday.trim()
            : null,
      gender: st.gender.trim() || null,
      qualifications: qualText,
      expert_bio: st.expert_bio,
      about_services: st.about_services,
      skills_specializations: st.skills_specializations.filter(Boolean),
      membership_tier: st.membership_tier,
      weekly_schedule: normalizeWeeklySchedule(st.weekly_schedule),
      experience_level:
        st.experience_level && experienceLevels.includes(st.experience_level as (typeof experienceLevels)[number])
          ? st.experience_level
          : null,
      category_id: !st.category_id || st.category_id === "__other__" ? null : st.category_id,
      auto_accept: st.auto_accept,
      allow_session_extensions: st.allow_session_extensions,
      first_session_discount_enabled: st.first_session_discount_enabled,
      first_session_discount_type: st.first_session_discount_enabled ? st.first_session_discount_type : null,
      first_session_discount_value:
        st.first_session_discount_enabled && fstValNum !== null && Number.isFinite(fstValNum) ? fstValNum : null,
      first_session_discount_max_session_minutes: st.first_session_discount_enabled ? fstMax : null,
      package_deal_enabled: st.package_deal_enabled,
      package_session_count:
        st.package_deal_enabled && pkgCountNum !== null && Number.isFinite(pkgCountNum) ? pkgCountNum : null,
      package_session_duration_minutes:
        st.package_deal_enabled && pkgDurNum !== null && Number.isFinite(pkgDurNum) ? pkgDurNum : null,
      package_discount_type: st.package_deal_enabled ? st.package_discount_type : null,
      package_discount_value:
        st.package_deal_enabled && pkgDiscNum !== null && Number.isFinite(pkgDiscNum) ? pkgDiscNum : null,
      package_require_purchase: st.package_deal_enabled ? st.package_require_purchase : false,
      current_step: nextStep ?? step,
    };

    const targetStep = nextStep ?? step;
    const persistPayout =
      options?.omitPayout !== true &&
      !payoutDevSkipped &&
      targetStep >= 7;
    if (persistPayout) {
      payload.payout_details = {
        legal_name: st.payout_details.legal_name.trim() || undefined,
        address_line1: st.payout_details.address_line1.trim() || undefined,
        city: st.payout_details.city.trim() || undefined,
        state: st.payout_details.state.trim() || undefined,
        postal_code: st.payout_details.postal_code.trim() || undefined,
        country: st.payout_details.country.trim() || undefined,
        routing_number: st.payout_details.routing_number.trim() || undefined,
        account_number: st.payout_details.account_number.trim() || undefined,
        tax_id_last4: st.payout_details.tax_id_last4.trim() || undefined,
      };
    }

    if (bookingComplete) {
      payload.rate_per_15_min = safeRate;
      payload.minimum_booking_minutes = safeMinBooking;
      payload.maximum_booking_minutes = safeMaxBooking;
      payload.minimum_notice_minutes = safeMinNotice;
      payload.maximum_notice_minutes = safeMaxNotice;
      payload.buffer_time_minutes = safeBuffer;
    }

    const res = await fetch("/api/experts/registration-draft", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      const reason =
        typeof json.error === "string"
          ? json.error
          : json.error && typeof json.error === "object"
            ? JSON.stringify(json.error)
            : "Failed to save";
      setError(reason);
      return false;
    }
    return true;
  }

  function initials(firstName: string, lastName: string, email: string) {
    const a = (firstName || "").trim().charAt(0);
    const b = (lastName || "").trim().charAt(0);
    const pair = `${a}${b}`.trim();
    if (pair) return pair.toUpperCase();
    return (email.trim().charAt(0) || "?").toUpperCase();
  }

  async function uploadProfilePhoto(file: File | null | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/me/profile-photo", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Could not upload photo");
        return;
      }
      const url = typeof json.url === "string" ? json.url : "";
      if (url) {
        setState((s) => ({ ...s, profile_photo: url }));
      }
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submitForApproval() {
    const fs = commitBirthdayDraftIfNeeded();
    for (let sh = 2; sh <= 8; sh++) {
      const fields = validateStepFields(sh, fs, categorySuggestion, { payoutDevSkipped });
      if (fields.length) {
        setInvalidFields(fields);
        setError("Please complete the highlighted required fields.");
        setStep(sh);
        return;
      }
    }
    setInvalidFields([]);
    setError(null);
    setSubmittingToDashboard(true);
    const saved = await saveDraft(slideCount, { mergedSnapshot: fs });
    if (!saved) {
      setSubmittingToDashboard(false);
      return;
    }
    const res = await fetch("/api/experts/registration-submit", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMissing((json.missing_fields as string[]) ?? []);
      setError(typeof json.error === "string" ? json.error : "Submission failed");
      setSubmittingToDashboard(false);
      return;
    }
    setMissing([]);
    // Keep the wizard/overlay up until the route change; do not setWizardOpen(false) here or the page flashes empty.
    router.replace("/dashboard?expertRegistrationComplete=1");
  }

  function next() {
    void (async () => {
      const formState = commitBirthdayDraftIfNeeded();
      const fields = validateStepFields(step, formState, categorySuggestion, { payoutDevSkipped });
      if (fields.length) {
        setInvalidFields(fields);
        setError("Please complete the highlighted required fields.");
        return;
      }
      setInvalidFields([]);
      setError(null);
      const target = Math.min(slideCount, step + 1);
      const atStep = step;
      const nowSnap = getWizardStepSnapshotJson(atStep, formState, categorySuggestion);
      const entrySnap = stepEntrySnapshotRef.current[atStep];
      const canSkipSave = entrySnap !== undefined && nowSnap === entrySnap;
      if (canSkipSave) {
        setStep(target);
        return;
      }
      const saved = await saveDraft(target, { mergedSnapshot: formState });
      if (saved) setStep(target);
    })();
  }

  function back() {
    setInvalidFields([]);
    setStep((s) => Math.max(1, s - 1));
  }

  function addSkill() {
    const v = skillsInput.trim();
    if (!v || state.skills_specializations.length >= 30) return;
    clearFieldInvalid("skills_specializations");
    setState((s) => ({ ...s, skills_specializations: [...s.skills_specializations, v] }));
    setSkillsInput("");
  }

  function removeSkill(index: number) {
    const nextLen = state.skills_specializations.length - 1;
    if (nextLen > 0) clearFieldInvalid("skills_specializations");
    setState((s) => ({
      ...s,
      skills_specializations: s.skills_specializations.filter((_, i) => i !== index),
    }));
  }

  function addQualItem() {
    const v = qualInput.trim();
    if (!v || state.qualification_items.length >= 10) return;
    clearFieldInvalid("qualification_items");
    setState((s) => ({ ...s, qualification_items: [...s.qualification_items, v] }));
    setQualInput("");
  }

  function removeQualItem(index: number) {
    const nextLen = state.qualification_items.length - 1;
    if (nextLen > 0) clearFieldInvalid("qualification_items");
    setState((s) => ({
      ...s,
      qualification_items: s.qualification_items.filter((_, i) => i !== index),
    }));
  }

  async function sendCategorySuggestion() {
    const suggestion = categorySuggestion.trim();
    if (!suggestion) return;
    const res = await fetch("/api/user-feedback/expert-category-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestion, context: { route: "expert-registration" } }),
    });
    if (res.ok) setCategorySuggestion("");
  }

  async function suggestBooking() {
    setGenerating(true);
    const res = await fetch("/api/expert-registration/generate/booking-preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profession: state.profession,
        experienceLevel: state.experience_level,
        qualifications: state.qualification_items,
        ratePer15: Number(state.rate_per_15_min || 0),
      }),
    });
    const json = await res.json().catch(() => ({}));
    const prefs = (json.preferences as Record<string, unknown>) ?? {};
    const suggestedRate = prefs.rate_per_15_min;
    const rateStr =
      suggestedRate != null && Number.isFinite(Number(suggestedRate)) && Number(suggestedRate) > 0
        ? String(Number(suggestedRate))
        : null;
    setState((s) => ({
      ...s,
      ...(rateStr ? { rate_per_15_min: rateStr } : {}),
      minimum_booking_minutes: String(prefs.minimum_booking_minutes ?? s.minimum_booking_minutes),
      maximum_booking_minutes: String(prefs.maximum_booking_minutes ?? s.maximum_booking_minutes),
      minimum_notice_minutes: String(prefs.minimum_notice_minutes ?? s.minimum_notice_minutes),
      maximum_notice_minutes: String(prefs.maximum_notice_minutes ?? s.maximum_notice_minutes),
      buffer_time_minutes: String(prefs.buffer_time_minutes ?? s.buffer_time_minutes),
      auto_accept: Boolean(prefs.auto_accept ?? s.auto_accept),
      allow_session_extensions: Boolean(prefs.allow_session_extensions ?? s.allow_session_extensions),
    }));
    setInvalidFields((prev) =>
      prev.filter(
        (k) =>
          k !== "rate_per_15_min" &&
          k !== "minimum_booking_minutes" &&
          k !== "maximum_booking_minutes" &&
          k !== "minimum_notice_minutes" &&
          k !== "maximum_notice_minutes" &&
          k !== "buffer_time_minutes",
      ),
    );
    setGenerating(false);
  }

  async function sendEnterpriseInquiry() {
    setError(null);
    setEnterpriseSending(true);
    try {
      const res = await fetch("/api/user-feedback/enterprise-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: enterpriseForm.message.trim(),
          coach_count: enterpriseForm.coach_count.trim(),
          best_time_to_contact: enterpriseForm.best_time.trim(),
          email: enterpriseForm.email.trim() || state.email,
          phone: enterpriseForm.phone.trim() || state.phone_number,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Could not send message");
        return;
      }
      setEnterpriseInquiryOpen(false);
      setEnterpriseForm((f) => ({ ...f, message: "" }));
    } finally {
      setEnterpriseSending(false);
    }
  }

  function previewFirstSessionTotal(): string {
    const rate = Number(state.rate_per_15_min);
    if (!state.first_session_discount_enabled || !Number.isFinite(rate) || rate <= 0) return "—";
    const v = Number(state.first_session_discount_value);
    if (state.first_session_discount_max_session_minutes === "any") {
      if (state.first_session_discount_type === "percent" && Number.isFinite(v)) {
        return `${Math.min(100, Math.max(0, v))}% off any session length`;
      }
      return "—";
    }
    const dur = Number(state.first_session_discount_max_session_minutes);
    if (!Number.isFinite(dur) || dur <= 0) return "—";
    const base = (rate / 15) * dur;
    if (state.first_session_discount_type === "percent" && Number.isFinite(v)) {
      return `$${(base * (1 - Math.min(100, Math.max(0, v)) / 100)).toFixed(2)}`;
    }
    if (state.first_session_discount_type === "fixed_amount" && Number.isFinite(v)) {
      return `$${Math.max(0, v).toFixed(2)}`;
    }
    return `$${base.toFixed(2)}`;
  }

  function previewPackageTotal(): string {
    const rate = Number(state.rate_per_15_min);
    const sessions = Number(state.package_session_count);
    const dur = Number(state.package_session_duration_minutes);
    if (!state.package_deal_enabled || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(sessions) || sessions <= 0 || !Number.isFinite(dur) || dur <= 0) {
      return "—";
    }
    const base = sessions * (rate / 15) * dur;
    const v = Number(state.package_discount_value);
    if (state.package_discount_type === "percent" && Number.isFinite(v)) {
      return `$${(base * (1 - Math.min(100, Math.max(0, v)) / 100)).toFixed(2)}`;
    }
    if (state.package_discount_type === "fixed_amount" && Number.isFinite(v)) {
      return `$${Math.max(0, v).toFixed(2)}`;
    }
    return `$${base.toFixed(2)}`;
  }

  function onExpertBirthdayFocus() {
    setBirthdayFieldFocused(true);
    setBirthdayDraft((prev) => {
      if (prev !== null) return prev;
      if (state.birthday && /^\d{4}-\d{2}-\d{2}$/.test(state.birthday)) return isoDateToUsDisplay(state.birthday);
      return "";
    });
  }

  const birthdayInputValue =
    birthdayDraft !== null
      ? birthdayDraft
      : state.birthday && /^\d{4}-\d{2}-\d{2}$/.test(state.birthday)
        ? isoDateToUsDisplay(state.birthday)
        : "";

  const birthdayInputPlaceholder = birthdayFieldFocused ? "mm/dd/yyyy" : "Birthday (optional)";

  function renderStepContent(activeStep: number) {
    if (activeStep === 2) {
      return (
        <>
          <WizardSectionHeading Icon={CircleUserRound}>Basic Information</WizardSectionHeading>
          <div className="mt-5 flex flex-col items-start gap-5 sm:mt-6 sm:flex-row sm:items-center">
            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-[#FFF6EE] text-3xl font-semibold text-[#003049] sm:h-36 sm:w-36 sm:text-4xl">
              {state.profile_photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={state.profile_photo}
                  alt="Profile preview"
                  className="h-32 w-32 rounded-full object-cover sm:h-36 sm:w-36"
                />
              ) : (
                initials(state.first_name, state.last_name, state.email)
              )}
            </div>
            <div className="flex w-full max-w-[13.5rem] flex-col space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-[#003049]/70">Change Photo</h4>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full rounded-xl border-2 border-[#003049] text-sm font-semibold text-[#003049]"
                onClick={() => uploadFileRef.current?.click()}
                disabled={photoBusy}
              >
                <Upload className="mr-2 h-4 w-4" />
                {photoBusy ? "Uploading..." : "Upload Photo"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full rounded-xl border-2 border-[#003049] text-sm font-semibold text-[#003049]"
                onClick={() => captureFileRef.current?.click()}
                disabled={photoBusy}
              >
                <Camera className="mr-2 h-4 w-4" />
                Take a Photo
              </Button>
            </div>
          </div>
          <div className="mt-5 grid gap-3.5 sm:mt-6">
            <div>
              <Input
                value={state.first_name}
                onChange={(e) => {
                  clearFieldInvalid("first_name");
                  setState({ ...state, first_name: e.target.value });
                }}
                placeholder="First Name"
                className={cn(manualInputClass, fieldInvalid("first_name") && requiredFieldRingClass)}
                aria-invalid={fieldInvalid("first_name")}
              />
              <RequiredFieldHint show={fieldInvalid("first_name")} />
            </div>
            <div>
              <Input
                value={state.last_name}
                onChange={(e) => {
                  clearFieldInvalid("last_name");
                  setState({ ...state, last_name: e.target.value });
                }}
                placeholder="Last Name"
                className={cn(manualInputClass, fieldInvalid("last_name") && requiredFieldRingClass)}
                aria-invalid={fieldInvalid("last_name")}
              />
              <RequiredFieldHint show={fieldInvalid("last_name")} />
            </div>
            <div>
              <Input
                value={state.email}
                readOnly
                placeholder="Email"
                className={cn(manualInputClass, fieldInvalid("email") && requiredFieldRingClass)}
                aria-invalid={fieldInvalid("email")}
              />
              <RequiredFieldHint show={fieldInvalid("email")} />
            </div>
            <Input
              value={state.phone_number}
              onChange={(e) => setState({ ...state, phone_number: e.target.value })}
              placeholder="Phone Number (for sms reminders)"
              className={manualInputClass}
            />
            <div>
              <Input
                ref={hometownWizardRef}
                value={state.hometown}
                onChange={(e) => {
                  clearFieldInvalid("hometown");
                  setState({ ...state, hometown: e.target.value });
                }}
                placeholder="Hometown (required)"
                className={cn(manualInputClass, fieldInvalid("hometown") && requiredFieldRingClass)}
                aria-invalid={fieldInvalid("hometown")}
              />
              <RequiredFieldHint show={fieldInvalid("hometown")} />
            </div>
            <div>
              <Input
                value={state.time_zone}
                readOnly
                placeholder={mapsConfigured ? "Set automatically from hometown" : "Time zone"}
                className={cn(manualInputClass, "cursor-default bg-[#F8FAFC]", fieldInvalid("time_zone") && requiredFieldRingClass)}
                aria-invalid={fieldInvalid("time_zone")}
              />
              <RequiredFieldHint show={fieldInvalid("time_zone")} />
              <p className="mt-1.5 text-left text-xs leading-relaxed text-[#003049]/70">{bookingInformationBodyText}</p>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Preferred language</Label>
              <Select
                value={state.language}
                onValueChange={(v) => setState({ ...state, language: v })}
              >
                <SelectTrigger className={manualSelectTriggerClass}>
                  <SelectValue placeholder="No preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={LANGUAGE_NONE}>No preference</SelectItem>
                  {languages.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="bday"
              maxLength={10}
              value={birthdayInputValue}
              onChange={(e) => {
                setBirthdayFieldFocused(true);
                setBirthdayDraft(maskUsDateDigitsFromInput(e.target.value));
              }}
              onFocus={onExpertBirthdayFocus}
              onBlur={flushExpertBirthdayDraft}
              placeholder={birthdayInputPlaceholder}
              className={manualInputClass}
              aria-label="Birthday (optional)"
            />
            <div>
              <Select value={state.gender} onValueChange={(v) => setState({ ...state, gender: v })}>
                <SelectTrigger className={manualSelectTriggerClass}>
                  <SelectValue placeholder="Gender (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {genders.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      );
    }
    if (activeStep === 3) {
      return (
        <>
          <WizardSectionHeading Icon={Briefcase}>Expert Profile</WizardSectionHeading>
          <p className={wizardSectionBodyClass}>
            Tell us about yourself and what you can offer our community.
          </p>
          <p className={cn(wizardSectionBodyClass, "mt-2")}>
            Use our generator tool anywhere you see a{" "}
            <Wand2
              className="inline-block h-3.5 w-3.5 align-[-0.15em] text-[#F77F00]"
              strokeWidth={2}
              aria-hidden
            />{" "}
            for some extra help getting started.
          </p>
          <div className="mt-4 grid gap-3 sm:mt-5">
            <div>
              <Input
                value={state.profession}
                onChange={(e) => {
                  clearFieldInvalid("profession");
                  setState({ ...state, profession: e.target.value });
                }}
                placeholder="Profession"
                className={cn(manualInputClass, fieldInvalid("profession") && requiredFieldRingClass)}
                aria-invalid={fieldInvalid("profession")}
              />
              <RequiredFieldHint show={fieldInvalid("profession")} />
            </div>
            <div>
              <Select
                value={state.category_id || "__none__"}
                onValueChange={(v) => {
                  clearFieldInvalid("category_id");
                  clearFieldInvalid("category_suggestion");
                  setState({ ...state, category_id: v === "__none__" ? "" : v });
                }}
              >
                <SelectTrigger
                  className={cn(manualSelectTriggerClass, fieldInvalid("category_id") && requiredFieldRingClass)}
                  aria-invalid={fieldInvalid("category_id")}
                >
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Category</SelectItem>
                <SelectItem value="__other__">Other</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.category_id} value={c.category_id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
              <RequiredFieldHint show={fieldInvalid("category_id")} />
            </div>
            {state.category_id === "__other__" ? (
              <div className="space-y-2 rounded-xl border border-[#003049]/15 bg-[#F8FAFC] p-4">
                <p className="text-xs font-medium text-[#003049]/85">
                  Not seeing a relevant category? Suggest one — we&apos;ll review your feedback.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="min-w-0 flex-1">
                    <Input
                      value={categorySuggestion}
                      onChange={(e) => {
                        clearFieldInvalid("category_suggestion");
                        setCategorySuggestion(e.target.value);
                      }}
                      placeholder="Suggest a category or specialization"
                      className={cn(manualInputClass, fieldInvalid("category_suggestion") && requiredFieldRingClass)}
                      aria-invalid={fieldInvalid("category_suggestion")}
                    />
                    <RequiredFieldHint show={fieldInvalid("category_suggestion")} />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 shrink-0 rounded-lg border-2 border-[#003049] text-sm font-semibold text-[#003049]"
                    onClick={() => void sendCategorySuggestion()}
                  >
                    Send Feedback
                  </Button>
                </div>
              </div>
            ) : null}
            <div>
              <Select
                value={state.experience_level || "__none__"}
                onValueChange={(v) => {
                  clearFieldInvalid("experience_level");
                  setState({ ...state, experience_level: v === "__none__" ? "" : v });
                }}
              >
                <SelectTrigger
                  className={cn(manualSelectTriggerClass, fieldInvalid("experience_level") && requiredFieldRingClass)}
                  aria-invalid={fieldInvalid("experience_level")}
                >
                  <SelectValue placeholder="Experience level" />
                </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Experience Level</SelectItem>
                {experienceLevels.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
              <RequiredFieldHint show={fieldInvalid("experience_level")} />
            </div>
            <div
              className={cn(
                "flex flex-col gap-2 rounded-xl p-1",
                fieldInvalid("qualification_items") && `${requiredFieldRingClass} bg-[#FFF6EE]/50`,
              )}
            >
            <p className="px-0.5 text-left text-xs font-semibold text-[#003049] sm:text-sm">
              Qualifications{" "}
              <span className="text-[9px] font-normal leading-snug text-[#003049]/75 sm:text-[10px]">
                (List relevant education, certification, awards, job experience, etc.)
              </span>
            </p>
            <div className="flex min-w-0 gap-2">
              <Input
                placeholder="Click + to add qualifications."
                value={qualInput}
                onChange={(e) => setQualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addQualItem();
                  }
                }}
                className={cn(manualInputClass, "min-w-0 flex-1")}
                aria-label="Qualifications. List relevant education, certification, awards, job experience, etc."
              />
              <Button
                type="button"
                variant="outline"
                className="h-9 shrink-0 rounded-lg border-2 border-[#003049] px-3 font-bold text-[#003049]"
                onClick={addQualItem}
              >
                +
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {state.qualification_items.map((q, i) => (
                <button
                  key={`${q}-${i}`}
                  type="button"
                  onClick={() => removeQualItem(i)}
                  className="rounded-full border border-[#003049]/20 bg-[#FFF6EE] px-2.5 py-1 text-xs font-medium text-[#003049] hover:bg-[#FFF6EE]/80"
                >
                  {q}
                </button>
              ))}
            </div>
            <RequiredFieldHint show={fieldInvalid("qualification_items")} />
            </div>
          </div>
        </>
      );
    }
    if (activeStep === 4) {
      return (
        <>
          <WizardSectionHeading Icon={Briefcase}>Expert Profile</WizardSectionHeading>
          <p className={wizardSectionBodyClass}>
            Tell us about yourself and what you can offer our community.
          </p>
          <p className={cn(wizardSectionBodyClass, "mt-2")}>
            Use our generator tool anywhere you see a{" "}
            <Wand2
              className="inline-block h-3.5 w-3.5 align-[-0.15em] text-[#F77F00]"
              strokeWidth={2}
              aria-hidden
            />{" "}
            for some extra help getting started.
          </p>
          <div className="mt-4 space-y-5 sm:mt-5">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-[#003049]">Professional Bio</h4>
              <Textarea
                rows={5}
                maxLength={1000}
                value={state.expert_bio}
                onChange={(e) => {
                  clearFieldInvalid("expert_bio");
                  setState({ ...state, expert_bio: e.target.value.slice(0, 1000) });
                }}
                placeholder="Tell us about yourself, your experience, and your passions."
                className={cn(
                  manualTextareaClass,
                  "mt-1.5",
                  fieldInvalid("expert_bio") && requiredFieldRingClass,
                )}
                aria-invalid={fieldInvalid("expert_bio")}
              />
              <RequiredFieldHint show={fieldInvalid("expert_bio")} />
              <BioGeneratorDialog
                profession={state.profession}
                qualificationItems={state.qualification_items}
                manualInputClass={manualInputClass}
                onBioGenerated={(bio) => {
                  clearFieldInvalid("expert_bio");
                  setState((s) => ({ ...s, expert_bio: bio.slice(0, 1000) }));
                }}
              />
              <p className="mt-1 text-[11px] text-[#003049]/60">{state.expert_bio.length}/1000</p>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-[#003049]">About Your Services</h4>
              <Textarea
                rows={4}
                maxLength={1000}
                value={state.about_services}
                onChange={(e) => setState({ ...state, about_services: e.target.value.slice(0, 1000) })}
                placeholder="About Your Services (describe how you can help learners on convene)"
                className={cn(manualTextareaClass, "mt-1.5")}
              />
              <ServicesGeneratorDialog
                manualInputClass={manualInputClass}
                onServicesGenerated={(text) => setState((s) => ({ ...s, about_services: text.slice(0, 1000) }))}
              />
              <p className="mt-1 text-[11px] text-[#003049]/60">{state.about_services.length}/1000</p>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-[#003049]">Skills &amp; Specializations</h4>
              <div
                className={cn(
                  "mt-1.5 flex gap-2 rounded-xl p-1",
                  fieldInvalid("skills_specializations") && `${requiredFieldRingClass} bg-[#FFF6EE]/50`,
                )}
              >
                <Input
                  placeholder="Click + to add skills"
                  value={skillsInput}
                  onChange={(e) => setSkillsInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSkill();
                    }
                  }}
                  className={manualInputClass}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0 rounded-lg border-2 border-[#003049] px-3 font-bold text-[#003049]"
                  onClick={addSkill}
                >
                  +
                </Button>
              </div>
              <RequiredFieldHint show={fieldInvalid("skills_specializations")} />
              <SkillsSuggestionDialog
                profession={state.profession}
                expertBio={state.expert_bio}
                qualificationItems={state.qualification_items}
                existingSkills={state.skills_specializations}
                onSkillsAdd={(skills) => {
                  clearFieldInvalid("skills_specializations");
                  setState((s) => ({
                    ...s,
                    skills_specializations: [...s.skills_specializations, ...skills].slice(0, 30),
                  }));
                }}
              />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {state.skills_specializations.map((q, i) => (
                  <button
                    key={`${q}-${i}`}
                    type="button"
                    onClick={() => removeSkill(i)}
                    className="rounded-full bg-[#003049] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#003049]/90"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      );
    }
    if (activeStep === 5) {
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
      const bookingSelectClass = cn(manualSelectTriggerClass, "w-full max-w-[220px]");
      const bookingInputClass = cn(manualInputClass, "max-w-[220px]");
      const fsAny = state.first_session_discount_max_session_minutes === "any";
      return (
        <>
          <WizardSectionHeading Icon={CalendarClock}>Booking Preferences</WizardSectionHeading>
          <p className={wizardSectionBodyClass}>
            Set preferences for how users will be able to book your time. See tips for maximizing your success and feel free to use that{" "}
            <Wand2 className="inline-block h-3.5 w-3.5 align-[-2px] text-[#F77F00]" aria-hidden /> button to get started.
          </p>
          <div className="mt-5 space-y-5 sm:mt-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-bold tracking-wide text-[#003049]">RATE (per 15 min)</Label>
                <InfoTip text={rateTip} />
              </div>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Booking Rate (per 15 min)"
                value={state.rate_per_15_min}
                onChange={(e) => {
                  clearFieldInvalid("rate_per_15_min");
                  setState({ ...state, rate_per_15_min: e.target.value });
                }}
                className={cn(bookingInputClass, fieldInvalid("rate_per_15_min") && requiredFieldRingClass)}
                aria-invalid={fieldInvalid("rate_per_15_min")}
              />
              <RequiredFieldHint show={fieldInvalid("rate_per_15_min")} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wide text-[#003049]">Minimum Booking Duration</Label>
                  <InfoTip text={minBookTip} />
                </div>
                <Select
                  value={state.minimum_booking_minutes || SELECT_EMPTY}
                  onValueChange={(v) => {
                    clearFieldInvalid("minimum_booking_minutes");
                    setState({ ...state, minimum_booking_minutes: v === SELECT_EMPTY ? "" : v });
                  }}
                >
                  <SelectTrigger
                    className={cn(bookingSelectClass, fieldInvalid("minimum_booking_minutes") && requiredFieldRingClass)}
                    aria-invalid={fieldInvalid("minimum_booking_minutes")}
                  >
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
                <RequiredFieldHint show={fieldInvalid("minimum_booking_minutes")} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wide text-[#003049]">Maximum Booking Duration</Label>
                  <InfoTip text={maxBookTip} />
                </div>
                <Select
                  value={state.maximum_booking_minutes || SELECT_EMPTY}
                  onValueChange={(v) => {
                    clearFieldInvalid("maximum_booking_minutes");
                    setState({ ...state, maximum_booking_minutes: v === SELECT_EMPTY ? "" : v });
                  }}
                >
                  <SelectTrigger
                    className={cn(bookingSelectClass, fieldInvalid("maximum_booking_minutes") && requiredFieldRingClass)}
                    aria-invalid={fieldInvalid("maximum_booking_minutes")}
                  >
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
                <RequiredFieldHint show={fieldInvalid("maximum_booking_minutes")} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wide text-[#003049]">Minimum Booking Notice</Label>
                  <InfoTip text={minNoticeTip} />
                </div>
                <Select
                  value={state.minimum_notice_minutes === "" ? SELECT_EMPTY : state.minimum_notice_minutes}
                  onValueChange={(v) => {
                    clearFieldInvalid("minimum_notice_minutes");
                    setState({ ...state, minimum_notice_minutes: v === SELECT_EMPTY ? "" : v });
                  }}
                >
                  <SelectTrigger
                    className={cn(bookingSelectClass, fieldInvalid("minimum_notice_minutes") && requiredFieldRingClass)}
                    aria-invalid={fieldInvalid("minimum_notice_minutes")}
                  >
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
                <RequiredFieldHint show={fieldInvalid("minimum_notice_minutes")} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-bold uppercase tracking-wide text-[#003049]">Maximum Booking Notice</Label>
                  <InfoTip text={maxNoticeTip} />
                </div>
                <Select
                  value={state.maximum_notice_minutes || SELECT_EMPTY}
                  onValueChange={(v) => {
                    clearFieldInvalid("maximum_notice_minutes");
                    setState({ ...state, maximum_notice_minutes: v === SELECT_EMPTY ? "" : v });
                  }}
                >
                  <SelectTrigger
                    className={cn(bookingSelectClass, fieldInvalid("maximum_notice_minutes") && requiredFieldRingClass)}
                    aria-invalid={fieldInvalid("maximum_notice_minutes")}
                  >
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
                <RequiredFieldHint show={fieldInvalid("maximum_notice_minutes")} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-bold uppercase tracking-wide text-[#003049]">Buffer Time</Label>
                <InfoTip text={bufferTip} />
              </div>
              <Select
                value={state.buffer_time_minutes === "" ? SELECT_EMPTY : state.buffer_time_minutes}
                onValueChange={(v) => {
                  clearFieldInvalid("buffer_time_minutes");
                  setState({ ...state, buffer_time_minutes: v === SELECT_EMPTY ? "" : v });
                }}
              >
                <SelectTrigger
                  className={cn(bookingSelectClass, fieldInvalid("buffer_time_minutes") && requiredFieldRingClass)}
                  aria-invalid={fieldInvalid("buffer_time_minutes")}
                >
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
              <RequiredFieldHint show={fieldInvalid("buffer_time_minutes")} />
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
                <button
                  type="button"
                  className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-[#003049] hover:text-[#F77F00]"
                  onClick={() => setAdvancedOptionsOpen((o) => !o)}
                >
                  Advanced Options{" "}
                  <span className="text-[#F77F00]" aria-hidden>
                    +
                  </span>
                </button>
              </div>
            </div>

            {advancedOptionsOpen ? (
              <div className="space-y-5 pt-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold text-[#003049]">Auto-Accept Bookings</Label>
                    <InfoTip text={autoAcceptTip} />
                  </div>
                  <Switch
                    checked={state.auto_accept}
                    onCheckedChange={(v) => setState({ ...state, auto_accept: v })}
                  />
                </div>
                {!state.auto_accept ? (
                  <p className="text-xs font-medium leading-relaxed text-[#003049]/85">
                    By turning Auto-Accept Bookings off, you will be required to approve each individual booking on your dashboard.
                  </p>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold text-[#003049]">Allow Session Extensions</Label>
                    <InfoTip text={extendTip} />
                  </div>
                  <Switch
                    checked={state.allow_session_extensions}
                    onCheckedChange={(v) => setState({ ...state, allow_session_extensions: v })}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-semibold text-[#003049]">Discount First Session</Label>
                      <InfoTip text={discountFirstTooltip} />
                    </div>
                    <Switch
                      checked={state.first_session_discount_enabled}
                      onCheckedChange={(v) => setState({ ...state, first_session_discount_enabled: v })}
                    />
                  </div>
                  {state.first_session_discount_enabled ? (
                    <div className="space-y-3 rounded-xl border border-[#003049]/15 bg-white p-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-[#003049]">Duration</Label>
                        <Select
                          value={state.first_session_discount_max_session_minutes}
                          onValueChange={(v) =>
                            setState((s) => ({
                              ...s,
                              first_session_discount_max_session_minutes: v,
                              first_session_discount_type: v === "any" ? "percent" : s.first_session_discount_type,
                            }))
                          }
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
                        value={fsAny ? "percent" : state.first_session_discount_type}
                        onValueChange={(v) =>
                          setState({ ...state, first_session_discount_type: v as "percent" | "fixed_amount" })
                        }
                        className="flex flex-wrap gap-4"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="fixed_amount" id="fs-fixed" disabled={fsAny} />
                          <Label
                            htmlFor="fs-fixed"
                            className={cn("text-sm font-normal", fsAny && "cursor-not-allowed opacity-50")}
                          >
                            Fixed Price
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="percent" id="fs-pct" />
                          <Label htmlFor="fs-pct" className="text-sm font-normal">
                            % Discount
                          </Label>
                        </div>
                      </RadioGroup>
                      <Input
                        placeholder={state.first_session_discount_type === "percent" ? "Percent discount" : "Fixed price (USD)"}
                        value={state.first_session_discount_value}
                        onChange={(e) => setState({ ...state, first_session_discount_value: e.target.value })}
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
                    <Switch
                      checked={state.package_deal_enabled}
                      onCheckedChange={(v) => setState({ ...state, package_deal_enabled: v })}
                    />
                  </div>
                  {state.package_deal_enabled ? (
                    <div className="space-y-3 rounded-xl border border-[#003049]/15 bg-white p-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-[#003049]">Number of sessions</Label>
                        <Input
                          type="number"
                          min={1}
                          placeholder="Number of sessions"
                          value={state.package_session_count}
                          onChange={(e) => setState({ ...state, package_session_count: e.target.value })}
                          className={manualInputClass}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-[#003049]">Session Duration</Label>
                        <Select
                          value={state.package_session_duration_minutes || SELECT_EMPTY}
                          onValueChange={(v) =>
                            setState({ ...state, package_session_duration_minutes: v === SELECT_EMPTY ? "" : v })
                          }
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
                        value={state.package_discount_type}
                        onValueChange={(v) =>
                          setState({ ...state, package_discount_type: v as "percent" | "fixed_amount" })
                        }
                        className="flex flex-wrap gap-4"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="fixed_amount" id="pkg-fixed" />
                          <Label htmlFor="pkg-fixed" className="text-sm font-normal">
                            Fixed Price
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="percent" id="pkg-pct" />
                          <Label htmlFor="pkg-pct" className="text-sm font-normal">
                            % Discount
                          </Label>
                        </div>
                      </RadioGroup>
                      <Input
                        placeholder={state.package_discount_type === "percent" ? "Percent discount" : "Fixed package price (USD)"}
                        value={state.package_discount_value}
                        onChange={(e) => setState({ ...state, package_discount_value: e.target.value })}
                        className={manualInputClass}
                      />
                      <p className="text-xs font-medium text-[#003049]/80">Estimated package total: {previewPackageTotal()}</p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-1">
                        <Label className="text-sm font-semibold text-[#003049]">Require Package Purchase</Label>
                        <Switch
                          checked={state.package_require_purchase}
                          onCheckedChange={(v) => setState({ ...state, package_require_purchase: v })}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </>
      );
    }
    if (activeStep === 6) {
      return (
        <>
          <WizardSectionHeading Icon={MapPin}>Weekly Availability</WizardSectionHeading>
          <p className={wizardSectionBodyClass}>
            Set your recurring availability on the calendar below. Click a time and day to create a bookable timeslot, and
            add as many as you&apos;d like.
          </p>
          <p className={cn(wizardSectionBodyClass, "mt-2")}>
            Note that you can always modify your availability and edit specific dates from your dashboard.
          </p>
          <div
            className={cn(
              "mt-5 rounded-xl p-1 sm:mt-6",
              fieldInvalid("weekly_schedule") && `${requiredFieldRingClass} bg-[#FFF6EE]/40`,
            )}
          >
            <WeeklyAvailabilityCalendar
              value={normalizeWeeklySchedule(state.weekly_schedule)}
              onChange={(next) => {
                clearFieldInvalid("weekly_schedule");
                setState((s) => ({ ...s, weekly_schedule: next }));
              }}
            />
            <RequiredFieldHint show={fieldInvalid("weekly_schedule")} />
          </div>
        </>
      );
    }
    if (activeStep === 7) {
      const pd = state.payout_details;
      const setPd = (patch: Partial<FormState["payout_details"]>) => {
        setPayoutDevSkipped(false);
        for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
          clearFieldInvalid(String(key));
        }
        setState((s) => ({ ...s, payout_details: { ...s.payout_details, ...patch } }));
      };
      const defaultLegal = `${state.first_name} ${state.last_name}`.trim();
      const showPayoutStepDevBypass =
        allowPayoutFormDevBypass || process.env.NODE_ENV === "development";
      const devBypassPayoutStep = () => {
        setError(null);
        void (async () => {
          setSaving(true);
          const target = 8;
          const saved = await saveDraft(target, { omitPayout: true });
          setSaving(false);
          if (saved) {
            setPayoutDevSkipped(true);
            setStep(target);
          }
        })();
      };
      return (
        <>
          {showPayoutStepDevBypass ? (
            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                className="h-9 border-2 border-amber-600 bg-amber-50/90 text-xs font-bold text-amber-950 hover:bg-amber-100/90 sm:text-sm"
                onClick={devBypassPayoutStep}
              >
                DEV bypass — skip this step
              </Button>
            </div>
          ) : null}
          <WizardSectionHeading Icon={CreditCard}>Payout Information</WizardSectionHeading>
          <p className={wizardSectionBodyClass}>
            convene pays out via electronic transfer on a monthly schedule. Enter your information below to receive
            payments for your coaching sessions.
          </p>
          <p className={cn(wizardSectionBodyClass, "mt-2")}>
            Your information is stored securely and used only for electronic payments.
          </p>
          <ExpertPayoutInformationFields
            email={state.email}
            phoneNumber={state.phone_number}
            onPhoneNumberChange={(v) => {
              clearFieldInvalid("phone_number");
              setState((s) => ({ ...s, phone_number: v }));
            }}
            payout={pd}
            onPayoutChange={setPd}
            manualInputClass={manualInputClass}
            defaultLegal={defaultLegal}
            invalidFieldKeys={invalidFields}
          />
        </>
      );
    }
    if (activeStep === 8) {
      const tierCardBase =
        "flex h-full min-h-0 flex-col rounded-2xl border-2 border-[#003049]/15 bg-[#F8FAFC] p-5 text-left text-[#003049] shadow-sm transition-colors hover:border-[#003049]/25";
      const checkClass = "mt-0.5 h-4 w-4 shrink-0 text-[#003049]";
      const tiers: {
        id: FormState["membership_tier"];
        name: string;
        price: string;
        blurb: string;
        highlight?: boolean;
        features: string[];
      }[] = [
        {
          id: "free",
          name: "Free",
          price: "$0",
          blurb: "Everything You Need to Start Coaching",
          features: [
            "Expert profile",
            "Scheduling and Booking System",
            "User messaging",
            "Community Request access",
            "Booking Analytics",
            "Customer support",
          ],
        },
        {
          id: "verified",
          name: "Verified",
          price: "$15",
          blurb: "By undergoing our verification process, Experts gain enhanced visibility and credibility in our community.",
          highlight: true,
          features: [
            "Verified expert badge",
            "Priority search results",
            "Priority customer support",
            "Marketing tools",
            "Everything included in Free",
          ],
        },
        {
          id: "enterprise",
          name: "Enterprise",
          price: "Custom Pricing",
          blurb: "Full-featured solution for established coaching businesses and B2B applications",
          features: [
            "Multiple Verified Experts",
            "Dedicated account manager",
            "Custom branding",
            "Advanced integrations",
            "White-label options",
            "Priority feature requests",
            "24/7 phone support",
            "Custom training sessions",
            "API access",
          ],
        },
      ];
      return (
        <>
          <WizardSectionHeading Icon={Crown}>Choose Your Plan</WizardSectionHeading>
          <p className={wizardSectionBodyClass}>Coaching on convene is always free.</p>
          <p className={cn(wizardSectionBodyClass, "mt-2")}>
            By upgrading to a &quot;verified&quot; account, we can offer more services, help bring you more bookings, and
            build more trust in our community.
          </p>
          <div
            className={cn(
              "mt-5 grid items-stretch gap-4 sm:mt-6 md:grid-cols-3",
              fieldInvalid("membership_tier") && `${requiredFieldRingClass} rounded-xl bg-[#FFF6EE]/40 p-2`,
            )}
          >
            {tiers.map((t) => {
              const selected = state.membership_tier === t.id;
              function selectTier() {
                clearFieldInvalid("membership_tier");
                setState({ ...state, membership_tier: t.id });
                if (t.id === "verified") {
                  setError(null);
                  setVerifiedConsentOpen(true);
                }
                if (t.id === "enterprise") {
                  setEnterpriseForm((f) => ({ ...f, email: state.email, phone: state.phone_number }));
                  setEnterpriseInquiryOpen(true);
                }
              }
              return (
                <div
                  key={t.id}
                  className={cn(
                    tierCardBase,
                    selected && "ring-2 ring-[#F77F00] ring-offset-2 ring-offset-white",
                  )}
                >
                  <div className="flex min-h-0 flex-1 flex-col">
                    {t.highlight ? (
                      <span className="mb-3 self-center rounded-full bg-[#F77F00] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white sm:text-xs">
                        Most Popular
                      </span>
                    ) : (
                      <span className="mb-3 h-[26px] shrink-0 sm:h-[28px]" aria-hidden />
                    )}
                    <div className="mb-3 text-center">
                      <p className="text-lg font-bold text-[#003049] sm:text-xl">{t.name}</p>
                      <p className="mt-2 text-2xl font-extrabold text-[#003049]">{t.price}</p>
                      {t.id === "verified" ? (
                        <p className="mt-1 text-xs font-medium text-[#003049]/65">per month</p>
                      ) : null}
                    </div>
                    <p className="mb-4 text-center text-[13px] font-medium leading-snug text-[#003049]/85">
                      {t.blurb}
                    </p>
                    <ul className="flex flex-col gap-2 text-left text-[13px] font-medium text-[#003049]">
                      {t.features.map((f) => (
                        <li key={f} className="flex gap-2">
                          <Check className={checkClass} strokeWidth={2.5} aria-hidden />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    type="button"
                    className={cn(
                      "mt-4 w-full shrink-0 font-bold",
                      selected
                        ? "border-0 bg-[#F77F00] text-white shadow-sm hover:bg-[#e07400] disabled:opacity-100"
                        : "border-0 bg-[#003049] text-white shadow-sm hover:bg-[#00263a]",
                    )}
                    disabled={selected}
                    onClick={selectTier}
                  >
                    {selected ? "Selected" : "Select"}
                  </Button>
                </div>
              );
            })}
          </div>
          <RequiredFieldHint show={fieldInvalid("membership_tier")} />
        </>
      );
    }
    if (activeStep === 9) {
      const catName =
        state.category_id && state.category_id !== "__other__"
          ? categories.find((c) => c.category_id === state.category_id)?.name ?? "—"
          : state.category_id === "__other__"
            ? "Other (suggested)"
            : "—";
      const sched = normalizeWeeklySchedule(state.weekly_schedule);
      const slotCount = Object.values(sched).reduce((n, slots) => n + slots.length, 0);
      const tierLabel =
        state.membership_tier === "free" ? "Free" : state.membership_tier === "verified" ? "Verified" : "Enterprise";

      return (
        <>
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#F77F00] text-white shadow-md sm:h-[72px] sm:w-[72px]">
              <Check className="h-9 w-9 sm:h-10 sm:w-10" strokeWidth={2.75} aria-hidden />
            </div>
            <h2 className="mt-4 text-xl font-bold tracking-tight text-[#003049] sm:text-2xl">Review &amp; Submit</h2>
            <p className="mt-2 max-w-lg text-[13px] font-medium leading-relaxed text-[#003049]/90 sm:text-sm">
              Review your information below. You can edit any field before submitting for admin approval.
            </p>
          </div>

          <div className="mt-8 space-y-8 text-left">
            <section>
              <h3 className="text-sm font-bold text-[#003049] sm:text-[15px]">Profile Photo</h3>
              <div className="mt-3 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-[#FFF6EE] text-2xl font-semibold text-[#003049] ring-1 ring-[#003049]/10 sm:h-32 sm:w-32 sm:text-3xl">
                  {state.profile_photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={state.profile_photo} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    initials(state.first_name, state.last_name, state.email)
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-[#003049]/70">Change Photo</h4>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-xl border-2 border-[#003049] text-sm font-semibold text-[#003049] hover:bg-[#003049]/5"
                      onClick={() => uploadFileRef.current?.click()}
                      disabled={photoBusy}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Photo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-xl border-2 border-[#003049] text-sm font-semibold text-[#003049] hover:bg-[#003049]/5"
                      onClick={() => captureFileRef.current?.click()}
                      disabled={photoBusy}
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      Take a Photo
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold text-[#003049] sm:text-[15px]">Contact Information</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">First Name</Label>
                  <Input
                    value={state.first_name}
                    onChange={(e) => {
                      clearFieldInvalid("first_name");
                      setState({ ...state, first_name: e.target.value });
                    }}
                    className={cn(manualInputClass, fieldInvalid("first_name") && requiredFieldRingClass)}
                    aria-invalid={fieldInvalid("first_name")}
                  />
                  <RequiredFieldHint show={fieldInvalid("first_name")} />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Last Name</Label>
                  <Input
                    value={state.last_name}
                    onChange={(e) => {
                      clearFieldInvalid("last_name");
                      setState({ ...state, last_name: e.target.value });
                    }}
                    className={cn(manualInputClass, fieldInvalid("last_name") && requiredFieldRingClass)}
                    aria-invalid={fieldInvalid("last_name")}
                  />
                  <RequiredFieldHint show={fieldInvalid("last_name")} />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Email</Label>
                  <Input
                    value={state.email}
                    readOnly
                    className={cn(manualInputClass, fieldInvalid("email") && requiredFieldRingClass)}
                    aria-invalid={fieldInvalid("email")}
                  />
                  <RequiredFieldHint show={fieldInvalid("email")} />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Phone (optional)</Label>
                  <Input
                    value={state.phone_number}
                    onChange={(e) => setState({ ...state, phone_number: e.target.value })}
                    placeholder="Phone Number"
                    className={manualInputClass}
                  />
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold text-[#003049] sm:text-[15px]">Booking Information</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
                <div className="sm:col-span-2">
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Hometown</Label>
                  <Input
                    ref={hometownWizardRef}
                    value={state.hometown}
                    onChange={(e) => {
                      clearFieldInvalid("hometown");
                      setState({ ...state, hometown: e.target.value });
                    }}
                    placeholder="Hometown (required)"
                    className={cn(manualInputClass, fieldInvalid("hometown") && requiredFieldRingClass)}
                    aria-invalid={fieldInvalid("hometown")}
                  />
                  <RequiredFieldHint show={fieldInvalid("hometown")} />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Time zone</Label>
                  <Input
                    value={state.time_zone}
                    readOnly
                    placeholder={mapsConfigured ? "Set automatically from hometown" : "Time zone"}
                    className={cn(
                      manualInputClass,
                      "cursor-default bg-[#F8FAFC]",
                      fieldInvalid("time_zone") && requiredFieldRingClass,
                    )}
                    aria-invalid={fieldInvalid("time_zone")}
                  />
                  <RequiredFieldHint show={fieldInvalid("time_zone")} />
                  <p className="mt-1 text-[11px] leading-snug text-[#003049]/70 sm:text-xs">{bookingInformationBodyText}</p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold text-[#003049] sm:text-[15px]">Expert credentials</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:gap-y-3">
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Profession</Label>
                  <Input
                    value={state.profession}
                    onChange={(e) => {
                      clearFieldInvalid("profession");
                      setState({ ...state, profession: e.target.value });
                    }}
                    className={cn(manualInputClass, fieldInvalid("profession") && requiredFieldRingClass)}
                    aria-invalid={fieldInvalid("profession")}
                  />
                  <RequiredFieldHint show={fieldInvalid("profession")} />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Category</Label>
                  <Input
                    value={catName}
                    readOnly
                    className={cn(
                      manualInputClass,
                      "bg-[#F8FAFC]",
                      fieldInvalid("category_id") && requiredFieldRingClass,
                    )}
                    aria-invalid={fieldInvalid("category_id")}
                  />
                  <RequiredFieldHint show={fieldInvalid("category_id")} />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Experience level</Label>
                  <Input
                    value={state.experience_level}
                    readOnly
                    className={cn(
                      manualInputClass,
                      "bg-[#F8FAFC]",
                      fieldInvalid("experience_level") && requiredFieldRingClass,
                    )}
                    aria-invalid={fieldInvalid("experience_level")}
                  />
                  <RequiredFieldHint show={fieldInvalid("experience_level")} />
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold text-[#003049] sm:text-[15px]">Profile</h3>
              <div className="mt-3 flex flex-col gap-3">
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Professional bio</Label>
                  <Textarea
                    rows={4}
                    maxLength={1000}
                    value={state.expert_bio}
                    onChange={(e) => {
                      clearFieldInvalid("expert_bio");
                      setState({ ...state, expert_bio: e.target.value.slice(0, 1000) });
                    }}
                    className={cn(manualTextareaClass, fieldInvalid("expert_bio") && requiredFieldRingClass)}
                    aria-invalid={fieldInvalid("expert_bio")}
                  />
                  <RequiredFieldHint show={fieldInvalid("expert_bio")} />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">About your services</Label>
                  <Textarea
                    rows={3}
                    maxLength={1000}
                    value={state.about_services}
                    onChange={(e) => setState({ ...state, about_services: e.target.value.slice(0, 1000) })}
                    className={manualTextareaClass}
                  />
                </div>
                <div
                  className={cn(
                    "rounded-lg p-1",
                    fieldInvalid("skills_specializations") && `${requiredFieldRingClass} bg-[#FFF6EE]/50`,
                  )}
                >
                  <p className="text-[13px] text-[#003049]/90">
                    <span className="font-semibold text-[#003049]">Skills: </span>
                    {state.skills_specializations.length
                      ? state.skills_specializations.join(", ")
                      : "—"}
                  </p>
                  <RequiredFieldHint show={fieldInvalid("skills_specializations")} />
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold text-[#003049] sm:text-[15px]">Booking &amp; availability</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4">
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Rate (per 15 min, USD)</Label>
                  <Input
                    type="number"
                    value={state.rate_per_15_min}
                    onChange={(e) => {
                      clearFieldInvalid("rate_per_15_min");
                      setState({ ...state, rate_per_15_min: e.target.value });
                    }}
                    className={cn(manualInputClass, fieldInvalid("rate_per_15_min") && requiredFieldRingClass)}
                    aria-invalid={fieldInvalid("rate_per_15_min")}
                  />
                  <RequiredFieldHint show={fieldInvalid("rate_per_15_min")} />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Weekly slots</Label>
                  <Input
                    value={`${slotCount} recurring slot${slotCount === 1 ? "" : "s"}`}
                    readOnly
                    className={cn(
                      manualInputClass,
                      "bg-[#F8FAFC]",
                      fieldInvalid("weekly_schedule") && requiredFieldRingClass,
                    )}
                    aria-invalid={fieldInvalid("weekly_schedule")}
                  />
                  <RequiredFieldHint show={fieldInvalid("weekly_schedule")} />
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold text-[#003049] sm:text-[15px]">Plan</h3>
              <div
                className={cn(
                  "mt-3 rounded-lg p-2",
                  fieldInvalid("membership_tier") && `${requiredFieldRingClass} bg-[#FFF6EE]/40`,
                )}
              >
                <p className="text-[13px] font-medium text-[#003049]">{tierLabel}</p>
                <RequiredFieldHint show={fieldInvalid("membership_tier")} />
              </div>
            </section>
          </div>
        </>
      );
    }
    return null;
  }

  const manualFullForm = (
    <div className="mt-5 space-y-5">
      {[2, 3, 4, 5, 6, 7, 8, 9].map((s) => (
        <section key={s} className="rounded-2xl border border-[#003049]/10 bg-white p-5 sm:p-6">
          {renderStepContent(s)}
        </section>
      ))}
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      {missing.length ? (
        <p className="mt-2 text-sm text-destructive">Missing required fields: {missing.join(", ")}</p>
      ) : null}
      {ok ? <p className="mt-2 text-sm text-emerald-600">{ok}</p> : null}
      <div className="mt-6 flex justify-center px-5 sm:px-6">
        <Button
          type="button"
          className="h-11 w-auto min-w-0 rounded-lg bg-[#F77F00] px-6 text-sm font-bold text-white sm:h-12 sm:px-8 sm:text-base"
          disabled={saving || submittingToDashboard}
          onClick={() => void submitForApproval()}
        >
          {submittingToDashboard ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Finishing your profile…
            </>
          ) : saving ? (
            "Saving…"
          ) : (
            "Submit Expert Profile"
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
    {submittingToDashboard ? (
      <div
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-3 bg-slate-900/60 px-6 backdrop-blur-sm"
        role="status"
        aria-live="polite"
        aria-label="Finishing your profile"
      >
        <Loader2 className="h-12 w-12 animate-spin text-white" aria-hidden />
        <p className="text-center text-base font-semibold text-white sm:text-lg">Finishing your profile…</p>
        <p className="text-center text-sm text-white/80">Opening your dashboard</p>
      </div>
    ) : null}
    <div className="min-h-screen bg-[#F8FAFC] px-5 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <header className="px-1 sm:px-0">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-[#F77F00] sm:text-[26px]">{heading}</h1>
          <p className="mt-1 text-[15px] font-semibold leading-tight text-[#003049]/80 sm:text-base">{subheading}</p>
        </header>

        {wizardOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/85 p-4 backdrop-blur-[2px] sm:p-6">
            <div
              className={cn(
                "relative z-20 mx-auto max-h-[min(90vh,820px)] w-full overflow-y-auto rounded-2xl bg-white pb-6 shadow-xl sm:pb-8",
                step === 6 || step === 8 || step === 9
                  ? "max-w-[min(96vw,1200px)]"
                  : "max-w-[min(92vw,620px)]",
              )}
            >
              <button
                type="button"
                aria-label="Close wizard"
                disabled={submittingToDashboard}
                className="absolute right-3 top-3 z-20 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#F77F00] bg-white text-[#003049] shadow-sm disabled:cursor-not-allowed disabled:opacity-40 sm:right-4 sm:top-4 sm:h-10 sm:w-10"
                onClick={() => setWizardOpen(false)}
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.5} />
              </button>

              {step === 1 ? (
                <div className="px-8 pb-10 pt-14 text-center sm:px-10 sm:pb-11 sm:pt-[4.25rem]">
                  <Sparkles
                    className="mx-auto h-12 w-12 text-[#003049] sm:h-14 sm:w-14"
                    strokeWidth={1.35}
                    aria-hidden
                  />
                  <h2 className="mt-6 text-2xl font-extrabold tracking-tight text-[#F77F00] sm:mt-7 sm:text-[26px]">
                    Hurrah!
                  </h2>
                  <p className="mx-auto mt-4 max-w-md text-[13px] font-medium leading-snug text-[#003049] sm:mt-5 sm:text-sm">
                    We&apos;re thrilled you&apos;ve decided to share your expertise with our community. Getting started is
                    easy — use our onboarding wizard or enter your details manually.
                  </p>
                  <div className="mx-auto mt-8 max-w-sm sm:mt-9">
                    <Button
                      type="button"
                      className="h-9 w-full rounded-lg bg-[#F77F00] text-sm font-bold text-white sm:h-10"
                      onClick={() => setStep(2)}
                    >
                      Continue with Onboarding Wizard
                      <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                    <button
                      type="button"
                      className="mt-3 text-sm font-normal text-[#003049] underline"
                      onClick={() => setWizardOpen(false)}
                    >
                      Enter my details manually
                    </button>
                  </div>
                </div>
              ) : null}

              {step >= 2 && step <= slideCount ? (
                <div className="px-4 pb-6 pt-[4.25rem] sm:pt-[4.75rem] md:px-7 md:pb-7 md:pr-14 md:pt-[4.5rem]">
                  <input
                    ref={uploadFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      void uploadProfilePhoto(file);
                      e.currentTarget.value = "";
                    }}
                  />
                  <input
                    ref={captureFileRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      void uploadProfilePhoto(file);
                      e.currentTarget.value = "";
                    }}
                  />
                  <div className="mb-5 pr-1 sm:mb-6">
                    <div className="mb-2 flex items-baseline justify-between gap-3 text-xs font-semibold leading-tight text-[#003049] sm:text-[13px]">
                      <span className="shrink-0">
                        {step === 9 ? "Review & submit" : `Step ${progressStepIndex} of ${WIZARD_STEP_COUNT}`}
                      </span>
                      <span className="min-w-0 text-right">{percentComplete}% complete</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-[#E5E7EB]">
                      <div className="h-2.5 rounded-full bg-[#F77F00]" style={{ width: `${percentComplete}%` }} />
                    </div>
                  </div>

                  <div className="min-h-0 rounded-xl border border-[#003049]/15 p-5 md:p-6">{renderStepContent(step)}</div>

                  {error ? <p className="mt-5 text-sm text-destructive sm:mt-6">{error}</p> : null}
                  {missing.length ? (
                    <p className="mt-3 text-sm text-destructive">Missing required fields: {missing.join(", ")}</p>
                  ) : null}
                  {ok ? <p className="mt-3 text-sm text-emerald-600">{ok}</p> : null}

                  <div
                    className={cn(
                      "mt-6 flex items-center gap-3 sm:mt-7",
                      step === 9 ? "flex-col sm:flex-row sm:justify-between" : "justify-between",
                    )}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-lg border-2 border-[#003049] px-4 text-sm font-bold text-[#003049] sm:h-10 sm:px-5"
                      disabled={saving || submittingToDashboard || step <= 2}
                      onClick={back}
                    >
                      <ChevronLeft className="mr-1.5 h-3.5 w-3.5" />
                      Back
                    </Button>
                    <div className={cn(step === 9 && "flex w-full justify-center sm:w-auto sm:flex-1 sm:justify-end")}>
                      <Button
                        type="button"
                        className={cn(
                          "rounded-lg bg-[#F77F00] text-sm font-bold text-white sm:h-10",
                          step === 9
                            ? "h-11 px-6 text-[15px] sm:h-12 sm:px-8 sm:text-base"
                            : "h-9 px-4 sm:px-5",
                        )}
                        disabled={saving || submittingToDashboard}
                        onClick={() => {
                          if (step < slideCount) void next();
                          else void submitForApproval();
                        }}
                      >
                        {submittingToDashboard ? (
                          <>
                            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                            Finishing your profile…
                          </>
                        ) : saving ? (
                          "Saving…"
                        ) : step < slideCount ? (
                          <>
                            Continue
                            <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                          </>
                        ) : (
                          "Submit Expert Profile"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-5">
            <div className="mb-4 flex items-center justify-between px-1">
              <h2 className="text-lg font-bold text-[#003049] sm:text-xl">Manual input</h2>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-lg border-2 border-[#003049] text-sm font-bold text-[#003049]"
                onClick={() => setWizardOpen(true)}
              >
                Re-open wizard
              </Button>
            </div>
            {manualFullForm}
          </div>
        )}
      </div>
    </div>

      <VerifiedSubscriptionConsentDialog
        open={verifiedConsentOpen}
        onOpenChange={setVerifiedConsentOpen}
        onContinue={() => setVerifiedSubscriptionOpen(true)}
      />

      <VerifiedSubscriptionDialog
        open={verifiedSubscriptionOpen}
        onOpenChange={setVerifiedSubscriptionOpen}
        onSuccess={() => {
          setError(null);
          void saveDraft(step);
        }}
      />

      <Dialog open={enterpriseInquiryOpen} onOpenChange={setEnterpriseInquiryOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#003049]">Contact us</DialogTitle>
          </DialogHeader>
          <DialogDescription className="text-sm leading-relaxed text-[#003049]/90">
            We welcome the opportunity to partner with companies and organizations and are excited to discuss our services.
            Please tell us about your organization below and a specialist will contact you shortly.
          </DialogDescription>
          <div className="grid gap-3 py-2">
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Message</Label>
              <Textarea
                rows={4}
                value={enterpriseForm.message}
                onChange={(e) => setEnterpriseForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="Tell us about your organization and goals"
                className={manualTextareaClass}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Number of Coaches on Your Team</Label>
              <Input
                value={enterpriseForm.coach_count}
                onChange={(e) => setEnterpriseForm((f) => ({ ...f, coach_count: e.target.value }))}
                className={manualInputClass}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Best time to contact you</Label>
              <Input
                value={enterpriseForm.best_time}
                onChange={(e) => setEnterpriseForm((f) => ({ ...f, best_time: e.target.value }))}
                placeholder="e.g. Weekdays 9am–5pm ET"
                className={manualInputClass}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Email</Label>
              <Input
                type="email"
                value={enterpriseForm.email}
                onChange={(e) => setEnterpriseForm((f) => ({ ...f, email: e.target.value }))}
                className={manualInputClass}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Phone number</Label>
              <Input
                value={enterpriseForm.phone}
                onChange={(e) => setEnterpriseForm((f) => ({ ...f, phone: e.target.value }))}
                className={manualInputClass}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEnterpriseInquiryOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#F77F00] font-bold text-white hover:bg-[#e07400]"
              disabled={enterpriseSending || enterpriseForm.message.trim().length < 10}
              onClick={() => void sendEnterpriseInquiry()}
            >
              {enterpriseSending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

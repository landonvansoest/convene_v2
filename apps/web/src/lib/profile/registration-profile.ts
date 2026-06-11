/**
 * Shared field list + formatting for learner registration (SignUp wizard/manual) and Profile Settings dashboard.
 * PATCH body must match `profilePatchSchema` in `/api/me`.
 */

export const languages = [
  "English",
  "Spanish",
  "French",
  "German",
  "Mandarin",
  "Arabic",
  "Hindi",
  "Portuguese",
  "Japanese",
];

/** Select value for optional language (sent as `null` in API patch). */
export const LANGUAGE_NONE = "__none__";

export const genders = ["Male", "Female", "Non-binary", "Prefer not to say"];

export function isValidIanaTimeZone(tz: string): boolean {
  const t = tz.trim();
  if (!t) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: t });
    return true;
  } catch {
    return false;
  }
}

export function isoDateToUsDisplay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

/** Accepts m/d/yyyy (1–2 digit month/day). Returns empty string if invalid. */
export function parseUsDateToIso(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1000 || year > 9999) return "";
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const t = Date.parse(`${iso}T12:00:00`);
  if (Number.isNaN(t)) return "";
  const check = new Date(t);
  if (check.getFullYear() !== year || check.getMonth() + 1 !== month || check.getDate() !== day) return "";
  return iso;
}

/**
 * Strips non-digits and inserts / after month and day (up to 8 digits → mm/dd/yyyy).
 * Matches learner signup (`SignUpPageClient`): typed digits with automatic slashes.
 */
export function maskUsDateDigitsFromInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export type RegistrationProfilePatch = {
  first_name?: string;
  last_name?: string;
  phone_number?: string | null;
  hometown?: string | null;
  time_zone?: string | null;
  language?: string | null;
  profession?: string | null;
  introduction?: string | null;
  birthday?: string | null;
  gender?: string | null;
  profile_photo?: string | null;
};

/** Same mapping as `buildDraftRegistrationPatch` in SignUpPageClient. */
export function buildRegistrationProfilePatch(args: {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  hometown: string;
  timeZone: string;
  language: string;
  profession: string;
  introduction: string;
  birthday: string;
  gender: string;
  profilePhotoUrl: string | null;
}): RegistrationProfilePatch {
  const patch: RegistrationProfilePatch = {
    first_name: args.firstName.trim(),
    last_name: args.lastName.trim(),
    phone_number: args.phoneNumber.trim() || null,
    hometown: args.hometown.trim() || null,
    time_zone: args.timeZone.trim() || null,
    language:
      !args.language.trim() || args.language === LANGUAGE_NONE ? null : args.language.trim(),
    profession: args.profession.trim() || null,
    introduction: args.introduction.trim() || null,
    gender: args.gender.trim() ? args.gender.trim() : null,
    profile_photo: args.profilePhotoUrl ?? null,
  };
  const bd = args.birthday.trim();
  if (bd === "") {
    patch.birthday = null;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(bd)) {
    patch.birthday = bd;
  }
  return patch;
}

export const manualInputClass =
  "h-9 text-[13px] leading-snug font-normal text-[#003049] placeholder:text-[#003049]";
export const manualTextareaClass =
  "min-h-[88px] text-[13px] leading-snug font-normal text-[#003049] placeholder:text-[#003049]";
export const manualSelectTriggerClass =
  "h-9 text-[13px] leading-snug font-normal text-[#003049] px-2.5 [&_span[data-placeholder]]:text-[#003049]";

export const sectionBodyClass =
  "mt-1.5 text-[13px] font-medium leading-snug text-[#003049]/90 sm:text-sm";

export const bookingInformationBodyText =
  "convene will calculate your time zone based on your hometown. Note that all booking information will be displayed in your hometown's time zone.";

export const bookingTimezoneHintMaps = "Time zone auto-detected based on your hometown.";

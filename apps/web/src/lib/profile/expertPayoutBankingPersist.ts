import type { ExpertPayoutDetailsInput } from "@/components/expert/ExpertPayoutInformationFields";
import {
  expertPayoutDetailsPayloadHasValues,
  experienceLevels,
} from "@/lib/expert-registration";
import {
  buildRegistrationProfilePatch,
  isValidIanaTimeZone,
  LANGUAGE_NONE,
} from "@/lib/profile/registration-profile";
import { validateExpertPayoutBankingDetails } from "@/lib/stripe/expertPayoutBankingValidation";

export type ExpertPayoutPersistBundle = {
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
  profilePhotoRemote: string | null;
  hasExpertProfile: boolean;
  expertCategoryId: string;
  expertExperience: string;
  expertQualItems: string[];
  expertAboutServices: string;
  expertSkills: string[];
  mapsConfigured: boolean;
  persistedBookingPair: { hometown: string; time_zone: string } | null;
  bookingTzStepOk: boolean;
};

export function assertBookingReadyForPayout(bundle: ExpertPayoutPersistBundle): void {
  if (!bundle.hometown.trim()) {
    throw new Error("Hometown is required.");
  }
  const tz = bundle.timeZone.trim();
  const mapsPickMessage =
    "Pick your hometown from the suggestions so convene can set your time zone from your city.";
  if (bundle.mapsConfigured) {
    if (!tz || !isValidIanaTimeZone(tz)) {
      throw new Error(mapsPickMessage);
    }
    const persisted = bundle.persistedBookingPair;
    const matchesPersisted =
      persisted &&
      persisted.hometown === bundle.hometown.trim() &&
      persisted.time_zone === tz;
    if (!matchesPersisted && !bundle.bookingTzStepOk) {
      throw new Error(mapsPickMessage);
    }
  } else if (!tz || !isValidIanaTimeZone(tz)) {
    throw new Error("Enter a valid IANA time zone (e.g. America/New_York).");
  }
}

/** Persists phone + payout to `/api/me` and expert registration draft (payout_details). */
export async function persistExpertPayoutBanking(
  bundle: ExpertPayoutPersistBundle,
  next: { phoneNumber: string; payout: ExpertPayoutDetailsInput },
): Promise<void> {
  const bankingCheck = validateExpertPayoutBankingDetails(next.phoneNumber.trim(), next.payout);
  if (!bankingCheck.ok) {
    throw new Error(bankingCheck.message);
  }
  if (!bundle.firstName.trim() || !bundle.lastName.trim()) {
    throw new Error("First name and last name are required.");
  }
  assertBookingReadyForPayout(bundle);

  const patch = buildRegistrationProfilePatch({
    firstName: bundle.firstName,
    lastName: bundle.lastName,
    phoneNumber: next.phoneNumber.trim(),
    hometown: bundle.hometown,
    timeZone: bundle.timeZone,
    language: bundle.language,
    profession: bundle.profession,
    introduction: bundle.introduction,
    birthday: bundle.birthday,
    gender: bundle.gender,
    profilePhotoUrl: bundle.profilePhotoRemote,
  });
  const res = await fetch("/api/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg =
      typeof data.error === "string"
        ? data.error
        : typeof data.error === "object"
          ? JSON.stringify(data.error)
          : "Save failed";
    throw new Error(msg);
  }

  if (!bundle.hasExpertProfile) {
    throw new Error("Expert profile missing.");
  }

  const bio = bundle.introduction.trim();
  const expLevel =
    bundle.expertExperience && experienceLevels.includes(bundle.expertExperience as (typeof experienceLevels)[number])
      ? bundle.expertExperience
      : null;

  const draftBody: Record<string, unknown> = {
    first_name: bundle.firstName.trim(),
    last_name: bundle.lastName.trim(),
    phone_number: next.phoneNumber.trim() || null,
    hometown: bundle.hometown.trim() || null,
    time_zone: bundle.timeZone.trim() || null,
    profession: bundle.profession.trim() || null,
    profile_photo: bundle.profilePhotoRemote,
    language:
      !bundle.language.trim() || bundle.language === LANGUAGE_NONE ? null : bundle.language.trim(),
    introduction: bio || null,
    expert_bio: bio ? bio.slice(0, 1000) : null,
    birthday: bundle.birthday.trim() === "" ? null : bundle.birthday.trim(),
    gender: bundle.gender.trim() || null,
    category_id:
      !bundle.expertCategoryId || bundle.expertCategoryId === "__other__"
        ? null
        : bundle.expertCategoryId,
    experience_level: expLevel,
    qualifications: bundle.expertQualItems.join("\n"),
    about_services: bundle.expertAboutServices.slice(0, 1000),
    skills_specializations: bundle.expertSkills.filter(Boolean).slice(0, 30),
  };

  const payoutPayload = {
    legal_name: next.payout.legal_name.trim() || undefined,
    address_line1: next.payout.address_line1.trim() || undefined,
    city: next.payout.city.trim() || undefined,
    state: next.payout.state.trim() || undefined,
    postal_code: next.payout.postal_code.trim() || undefined,
    country: next.payout.country.trim() || undefined,
    routing_number: next.payout.routing_number.trim() || undefined,
    account_number: next.payout.account_number.trim() || undefined,
    tax_id_last4: next.payout.tax_id_last4.trim() || undefined,
  };
  if (expertPayoutDetailsPayloadHasValues(payoutPayload)) {
    draftBody.payout_details = payoutPayload;
  }

  const draftRes = await fetch("/api/experts/registration-draft", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draftBody),
  });
  if (!draftRes.ok) {
    const dj = await draftRes.json().catch(() => ({}));
    const msg =
      typeof dj.error === "string"
        ? dj.error
        : dj.error && typeof dj.error === "object"
          ? JSON.stringify(dj.error)
          : "Expert listing sync failed";
    throw new Error(msg);
  }
}

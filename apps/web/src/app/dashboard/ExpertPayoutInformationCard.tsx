"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpertPayoutInformationDialog } from "@/components/expert/ExpertPayoutInformationDialog";
import { experienceLevels } from "@/lib/expert-registration";
import { maskDigitsExceptLastFour } from "@/lib/profile/expert-payout-display";
import {
  type ExpertPayoutPersistBundle,
  persistExpertPayoutBanking,
} from "@/lib/profile/expertPayoutBankingPersist";
import { LANGUAGE_NONE, isValidIanaTimeZone, sectionBodyClass } from "@/lib/profile/registration-profile";

function parseQualificationsFromList(s: string): string[] {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 10);
}

/**
 * Dashboard Earnings tab: payout summary + wizard-parity banking dialog (moved from Expert Profile).
 */
export function ExpertPayoutInformationCard() {
  const mapsConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim());
  const persistedBookingPairRef = useRef<{ hometown: string; time_zone: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [showCard, setShowCard] = useState(false);

  const [bundle, setBundle] = useState<ExpertPayoutPersistBundle | null>(null);

  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [payoutLegalName, setPayoutLegalName] = useState("");
  const [payoutAddress1, setPayoutAddress1] = useState("");
  const [payoutCity, setPayoutCity] = useState("");
  const [payoutState, setPayoutState] = useState("");
  const [payoutPostal, setPayoutPostal] = useState("");
  const [payoutCountry, setPayoutCountry] = useState("US");
  const [payoutRouting, setPayoutRouting] = useState("");
  const [payoutAccount, setPayoutAccount] = useState("");
  const [payoutTaxLast4, setPayoutTaxLast4] = useState("");

  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [payoutDialogBusy, setPayoutDialogBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch("/api/me");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.user) {
          setShowCard(false);
          return;
        }
        const profile = data.profile as Record<string, unknown> | null;
        const expert = Boolean(profile?.has_expert_profile);
        const em = String(data.user.email ?? "");
        if (!expert || !profile) {
          setShowCard(false);
          return;
        }

        const firstName = String(profile.first_name ?? "");
        const lastName = String(profile.last_name ?? "");
        const phone = String(profile.phone_number ?? "");
        const hometown = String(profile.hometown ?? "");
        const timeZoneVal = String(profile.time_zone ?? "");
        const persistedLang = profile.language;
        const lang =
          persistedLang && String(persistedLang).trim()
            ? String(persistedLang)
            : LANGUAGE_NONE;
        const profession = String(profile.profession ?? "");
        let intro = String(profile.introduction ?? "").trim();
        const birthday = profile.birthday ? String(profile.birthday).slice(0, 10) : "";
        const gender = String(profile.gender ?? "");
        const photo = profile.profile_photo ? String(profile.profile_photo) : null;

        persistedBookingPairRef.current =
          hometown && timeZoneVal && isValidIanaTimeZone(timeZoneVal)
            ? { hometown, time_zone: timeZoneVal }
            : null;
        const tzOk =
          !mapsConfigured ||
          (Boolean(hometown) && Boolean(timeZoneVal) && isValidIanaTimeZone(timeZoneVal));

        const draftRes = await fetch("/api/experts/registration-draft", { cache: "no-store" });
        const dj = (await draftRes.json().catch(() => ({}))) as {
          profile?: Record<string, unknown> | null;
        };
        let categoryId = "";
        let expLevel = "";
        let qualItems: string[] = [];
        let aboutServices = "";
        let skills: string[] = [];

        let poLegal = "";
        let poAddr = "";
        let poCity = "";
        let poState = "";
        let poPostal = "";
        let poCountry = "US";
        let poRoute = "";
        let poAcct = "";
        let poTax = "";

        const prof = dj.profile;
        if (prof && typeof prof === "object") {
          const listingBio = String(prof.expert_bio ?? "").trim();
          if (listingBio) intro = listingBio;
          const cid = prof.category_id;
          categoryId = cid != null && String(cid).trim() ? String(cid) : "";
          const ex = String(prof.experience_level ?? "");
          expLevel = experienceLevels.includes(ex as (typeof experienceLevels)[number]) ? ex : "";
          qualItems = parseQualificationsFromList(String(prof.qualifications ?? ""));
          aboutServices = String(prof.about_services ?? "").slice(0, 1000);
          const sk = prof.skills_specializations;
          skills = Array.isArray(sk)
            ? sk.filter((x): x is string => typeof x === "string").slice(0, 30)
            : [];

          const rawPd = prof.payout_details;
          const po = rawPd && typeof rawPd === "object" ? (rawPd as Record<string, unknown>) : {};
          poLegal = String(po.legal_name ?? "");
          poAddr = String(po.address_line1 ?? "");
          poCity = String(po.city ?? "");
          poState = String(po.state ?? "");
          poPostal = String(po.postal_code ?? "");
          poCountry = String(po.country ?? "US") || "US";
          poRoute = String(po.routing_number ?? "");
          poAcct = String(po.account_number ?? "");
          poTax = String(po.tax_id_last4 ?? "");
        }

        const nextBundle: ExpertPayoutPersistBundle = {
          firstName,
          lastName,
          phoneNumber: phone,
          hometown,
          timeZone: timeZoneVal,
          language: lang,
          profession,
          introduction: intro,
          birthday,
          gender,
          profilePhotoRemote: photo,
          hasExpertProfile: true,
          expertCategoryId: categoryId,
          expertExperience: expLevel,
          expertQualItems: qualItems,
          expertAboutServices: aboutServices,
          expertSkills: skills,
          mapsConfigured,
          persistedBookingPair: persistedBookingPairRef.current,
          bookingTzStepOk: tzOk,
        };

        if (cancelled) return;
        setEmail(em);
        setPhoneNumber(phone);
        setPayoutLegalName(poLegal);
        setPayoutAddress1(poAddr);
        setPayoutCity(poCity);
        setPayoutState(poState);
        setPayoutPostal(poPostal);
        setPayoutCountry(poCountry);
        setPayoutRouting(poRoute);
        setPayoutAccount(poAcct);
        setPayoutTaxLast4(poTax);
        setBundle(nextBundle);
        setShowCard(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not load payout information.";
        setErr(msg);
        setShowCard(false);
        setBundle(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapsConfigured]);

  function buildBundleFromState(): ExpertPayoutPersistBundle {
    if (!bundle) {
      throw new Error("Not loaded");
    }
    return {
      ...bundle,
      phoneNumber,
      persistedBookingPair: persistedBookingPairRef.current,
    };
  }

  const defaultLegalNameForPayout = `${String(bundle?.firstName ?? "").trim()} ${String(bundle?.lastName ?? "").trim()}`.trim();

  if (loading) {
    return null;
  }
  if (!showCard || !bundle) {
    return err ? (
      <section className="rounded-xl border border-destructive/25 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#F77F00]/15 text-[#F77F00]">
            <Banknote className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-bold text-[#003049] sm:text-lg">Payout Information</h2>
            <p className={`${sectionBodyClass} mt-1`}>{err}</p>
          </div>
        </div>
      </section>
    ) : null;
  }

  return (
    <>
      <section className="rounded-xl border border-[#003049]/10 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#F77F00]/15 text-[#F77F00]">
            <Banknote className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-[#003049] sm:text-lg">Payout Information</h2>
            <p className={`${sectionBodyClass} mt-0.5`}>
              Securely update your banking information for payouts from your sessions.
            </p>
            {err ? <p className="mt-3 text-sm text-destructive">{err}</p> : null}
            {ok ? <p className="mt-3 text-sm text-emerald-600">{ok}</p> : null}
          </div>
        </div>
        <div className="mt-5 rounded-lg border border-[#003049]/10 bg-[#F8FAFC] p-4">
          <p className="text-sm font-semibold text-[#003049]">
            {payoutLegalName.trim() || defaultLegalNameForPayout || "Bank account"}
          </p>
          {payoutAccount.replace(/\D/g, "").length >= 4 ? (
            <p className="mt-1 text-sm font-medium text-[#003049]/80">
              Checking account {maskDigitsExceptLastFour(payoutAccount)}
            </p>
          ) : payoutAccount.trim() ? (
            <p className="mt-1 text-sm font-medium text-[#003049]/70">
              Account on file — add a full account number when you update.
            </p>
          ) : (
            <p className="mt-1 text-sm font-medium text-[#003049]/60">No payout account on file yet.</p>
          )}
          {payoutRouting.replace(/\D/g, "").length > 0 ? (
            <p className="mt-1 text-xs font-medium tabular-nums text-[#003049]/65">
              Routing {maskDigitsExceptLastFour(payoutRouting)}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          className="mt-4 w-full bg-[#F77F00] font-semibold text-white hover:bg-[#F77F00]/90 sm:w-auto"
          onClick={() => {
            setOk(null);
            setErr(null);
            setPayoutDialogOpen(true);
          }}
        >
          Update Bank Information
        </Button>
      </section>

      <ExpertPayoutInformationDialog
        open={payoutDialogOpen}
        onOpenChange={setPayoutDialogOpen}
        email={email}
        phoneNumber={phoneNumber}
        defaultLegalNameFallback={defaultLegalNameForPayout}
        initialPayout={{
          legal_name: payoutLegalName,
          address_line1: payoutAddress1,
          city: payoutCity,
          state: payoutState,
          postal_code: payoutPostal,
          country: payoutCountry,
          routing_number: payoutRouting,
          account_number: payoutAccount,
          tax_id_last4: payoutTaxLast4,
        }}
        saving={payoutDialogBusy}
        onSave={async (next) => {
          setPayoutDialogBusy(true);
          setErr(null);
          setOk(null);
          try {
            const b = buildBundleFromState();
            await persistExpertPayoutBanking(b, next);
            setPhoneNumber(next.phoneNumber.trim());
            setPayoutLegalName(next.payout.legal_name.trim());
            setPayoutAddress1(next.payout.address_line1.trim());
            setPayoutCity(next.payout.city.trim());
            setPayoutState(next.payout.state.trim());
            setPayoutPostal(next.payout.postal_code.trim());
            setPayoutCountry(next.payout.country.trim() || "US");
            setPayoutRouting(next.payout.routing_number.trim());
            setPayoutAccount(next.payout.account_number.trim());
            setPayoutTaxLast4(next.payout.tax_id_last4.trim());
            setBundle({
              ...b,
              phoneNumber: next.phoneNumber.trim(),
            });
            setOk("Bank information updated.");
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Save failed";
            setErr(msg);
            throw e;
          } finally {
            setPayoutDialogBusy(false);
          }
        }}
      />
    </>
  );
}

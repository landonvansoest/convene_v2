"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SignInDialog } from "@/components/auth/SignInDialog";
import { ExpertWeeklyBookingWidget } from "@/components/expert/ExpertWeeklyBookingWidget";
import { SessionBookingDialog } from "@/components/expert/SessionBookingDialog";
import { PackagePurchaseDialog, type PackageOfferPreview } from "@/components/expert/PackagePurchaseDialog";
import { PartnerConversationDialog } from "@/components/dashboard/PartnerConversationDialog";
import type { BookingWeekPreview, ExpertAvailabilityForPreview, ExpertBlockingInterval } from "@/lib/expertBookingPreview";
import { computeBookingWeekPreview, parseMinBookingMinutes } from "@/lib/expertBookingPreview";
import { intervalStringToMinutes } from "@/lib/expert-registration";
import { ExpertsGrid, type ExpertsGridExpert } from "@/components/home/ExpertsGrid";
import { formatHometownForDisplay } from "@/lib/formatHometownDisplay";
import { formatDependabilityRating } from "@/lib/formatDependabilityRating";
import { isExpertProfilePubliclyViewable } from "@/lib/expertVisibilityState";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { formatRatePer15Min } from "@/lib/rates";
import {
  formatFirstSessionConsultationLengthLabel,
  formatFirstSessionConsultationPriceLabel,
  isFirstSessionDiscountAdvertised,
} from "@/lib/pricing/first-session-discount";
import {
  expertRequiresPackageAfterFirstSession,
  expertRequiresPackagePurchase,
  expertRequiresPackagePurchaseForLearner,
  isSessionPackagesAdvertised,
  packageBookingNotice,
  packageSessionCount,
  packageSessionDurationMinutes,
  requiredPackageSessionCount,
  requiredPackageSessionDurationMinutes,
} from "@/lib/packages/package-deal";
import { isPackageCreditUsable } from "@/lib/packages/learner-package-credits";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OnlineNowPill, AvailableNowPill } from "@/components/presence/OnlineDot";
import { VerifiedExpertBadge } from "@/components/expert/VerifiedExpertBadge";
import { FirstSessionDiscountBadge } from "@/components/expert/FirstSessionDiscountBadge";
import { SessionPackagesBadge } from "@/components/expert/SessionPackagesBadge";
import { VisibleTempDot } from "@/components/presence/VisibleTempDot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Star,
  MapPin,
  MessageSquare,
  Calendar,
  DollarSign,
  ChevronLeft,
  Clock3,
  ShieldCheck,
  BookOpen,
  GraduationCap,
  Wrench,
  BarChart3,
  CheckCircle2,
} from "lucide-react";

type PackageCreditRow = {
  credit_id: string;
  remaining_credits: number;
  expiration_at: string | null;
  expert_user_id: string | null;
  session_duration_minutes: number | null;
};

type Pkg = {
  package_id: string;
  title: string;
  description: string | null;
  session_count: number;
  session_duration_minutes: number;
  price_cents: number | null;
  stripe_price_id: string | null;
  currency: string;
};

type Review = {
  review_id: string;
  overall_rating: number;
  public_review: string | null;
  created_at: string;
  reviewer_name?: string;
  reviewer_photo?: string | null;
};

function parseSlotStartUtcMs(raw: string): number | null {
  const s = decodeURIComponent(raw).trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n > 1_000_000_000_000) return Math.round(n);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export default function ExpertProfilePage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [expert, setExpert] = useState<Record<string, unknown> | null>(null);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avg, setAvg] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signInState, setSignInState] = useState<{
    open: boolean;
    description: string | null;
    redirect: string | null;
  }>({ open: false, description: null, redirect: null });
  const [similar, setSimilar] = useState<ExpertsGridExpert[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [packagePurchaseOpen, setPackagePurchaseOpen] = useState(false);
  const [packageOffer, setPackageOffer] = useState<PackageOfferPreview | null>(null);
  const [packageOfferLoading, setPackageOfferLoading] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [bookingAnchorUtc, setBookingAnchorUtc] = useState<number | null>(null);
  const [me, setMe] = useState<{ user: { id: string } | null; profile: Record<string, unknown> | null } | null>(
    null,
  );
  const [learnerPackageCredits, setLearnerPackageCredits] = useState<PackageCreditRow[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErr(null);
    const [eRes, pRes, rRes] = await Promise.all([
      fetch(`/api/experts/${encodeURIComponent(id)}`),
      fetch(`/api/experts/${encodeURIComponent(id)}/packages`),
      fetch(`/api/experts/${encodeURIComponent(id)}/reviews?limit=12`),
    ]);
    const eJson = await eRes.json();
    const pJson = await pRes.json();
    const rJson = await rRes.json();
    if (!eRes.ok) {
      setErr(typeof eJson.error === "string" ? eJson.error : "Failed to load expert");
      setExpert(null);
    } else {
      setExpert((eJson.expert as Record<string, unknown>) ?? null);
    }
    setPackages((pJson.packages as Pkg[]) ?? []);
    setReviews((rJson.reviews as Review[]) ?? []);
    setAvg(typeof rJson.average_overall === "number" ? rJson.average_overall : null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    function loadMe() {
      void fetch("/api/me")
        .then((r) => r.json() as Promise<{ user: { id: string } | null; profile: Record<string, unknown> | null }>)
        .then((j) => {
          if (!cancelled) setMe(j);
        });
    }
    loadMe();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadMe();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!me?.user?.id) {
      setLearnerPackageCredits([]);
      return;
    }
    let cancelled = false;
    void fetch("/api/me/package-credits")
      .then((r) => r.json() as Promise<{ credits?: PackageCreditRow[] }>)
      .then((j) => {
        if (!cancelled) setLearnerPackageCredits(j.credits ?? []);
      })
      .catch(() => {
        if (!cancelled) setLearnerPackageCredits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [me?.user?.id]);

  useEffect(() => {
    if (loading || !expert || !me?.user) return;
    if (searchParams.get("message") !== "1") return;
    setMessageOpen(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("message");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [loading, expert, me?.user, searchParams, pathname, router]);

  async function openMessageThread() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      setMessageOpen(true);
      return;
    }
    setSignInState({
      open: true,
      description: "Sign in to message this expert.",
      redirect: `/experts/${id}?message=1`,
    });
  }

  const name = expert ? String(expert.name ?? expert.email ?? "Expert") : "";
  const title = expert ? String(expert.profession ?? "Expert") : "";
  const hometownRaw = expert ? String(expert.hometown ?? "") : "";
  const hometownDisplay = useMemo(
    () => formatHometownForDisplay(hometownRaw),
    [hometownRaw],
  );
  const category = expert ? String(expert.category_name ?? "") : "";
  const categoryId = expert ? String(expert.category_id ?? "") : "";
  const bio = expert ? String(expert.expert_bio ?? "") : "";
  const about = expert ? String(expert.about_services ?? "") : "";
  const skills = useMemo(
    () => (expert?.skills_specializations as string[] | undefined) ?? [],
    [expert?.skills_specializations],
  );
  const rate = expert != null ? Number(expert.rate ?? 0) : 0;
  const verified = Boolean(expert?.is_verified);
  const sessions = expert != null ? Number(expert.complete_sessions ?? 0) : 0;
  const dependabilityRating =
    expert != null && expert.expert_dependability_rating != null
      ? Number(expert.expert_dependability_rating)
      : NaN;
  const dependability = Number.isFinite(dependabilityRating) ? dependabilityRating : 0;
  const visibility = expert ? String(expert.expert_visibility_state ?? "") : "";
  const isVisible = !visibility || isExpertProfilePubliclyViewable(visibility);
  const photo = expert?.profile_photo ? String(expert.profile_photo) : null;
  const online = Boolean(expert?.online);
  const availableNow = Boolean(expert?.available_now);
  const autoBook = Boolean(expert?.auto_accept);
  const minimumBooking = expert?.minimum_booking ? String(expert.minimum_booking) : "";
  const maximumBooking = expert?.maximum_booking ? String(expert.maximum_booking) : "";
  const minimumNotice = expert?.minimum_notice ? String(expert.minimum_notice) : "";
  const cancellationRate = expert != null ? Number(expert.cancellation_rate ?? NaN) : NaN;
  const experienceLevel = expert ? String(expert.experience_level ?? "") : "";
  const qualifications = expert ? String(expert.qualifications ?? "") : "";

  const initials = name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const minimumBookingLabel = minimumBooking
    ? String(minimumBooking).replace(/^(\d{2}):(\d{2}):\d{2}$/, (_m, h, m) => {
        const mins = Number(h) * 60 + Number(m);
        return mins > 0 ? `${mins} min` : "Not set";
      })
    : "Not set";
  const maximumBookingLabel = maximumBooking
    ? String(maximumBooking).replace(/^(\d{2}):(\d{2}):\d{2}$/, (_m, h, m) => {
        const mins = Number(h) * 60 + Number(m);
        return mins > 0 ? `${mins} min` : "Not set";
      })
    : "Not set";
  const availabilityForBooking = useMemo((): ExpertAvailabilityForPreview | null => {
    if (!expert) return null;
    return {
      weekly_schedule: expert.weekly_schedule,
      availability_overrides: expert.availability_overrides,
      calendar_paused:
        expert.calendar_paused === true ? true : expert.calendar_paused === false ? false : null,
      minimum_notice: expert.minimum_notice,
      maximum_notice: expert.maximum_notice,
      minimum_booking: expert.minimum_booking,
      buffer_time:
        typeof expert.buffer_time === "number" && Number.isFinite(expert.buffer_time)
          ? expert.buffer_time
          : null,
    };
  }, [expert]);

  const signedIn = Boolean(me?.user?.id);
  const packageOffered = isSessionPackagesAdvertised(expert);
  const packageRequireImmediate = expertRequiresPackagePurchase(expert);
  const packageRequireAfterFirst = expertRequiresPackageAfterFirstSession(expert);
  const viewerHasPaidSession = Boolean(
    (expert as { viewer_has_paid_session_with_expert?: boolean } | null)
      ?.viewer_has_paid_session_with_expert,
  );
  const packageRequired = expert
    ? expertRequiresPackagePurchaseForLearner(expert, viewerHasPaidSession)
    : false;
  const packageSessions = packageSessionCount(expert);
  const packageDuration = packageSessionDurationMinutes(expert);
  const requiredPackageSessions = requiredPackageSessionCount(expert);
  const requiredPackageDuration = requiredPackageSessionDurationMinutes(expert);
  const firstSessionConsultationLength = formatFirstSessionConsultationLengthLabel(
    expert?.first_session_discount_max_session_minutes ?? null,
  );
  const firstSessionConsultationPrice = formatFirstSessionConsultationPriceLabel({
    first_session_discount_type: expert?.first_session_discount_type,
    first_session_discount_value: expert?.first_session_discount_value,
    first_session_discount_max_session_minutes: expert?.first_session_discount_max_session_minutes,
    ratePer15Min: rate,
  });

  const usableExpertCredits = useMemo(() => {
    return learnerPackageCredits.filter(
      (c) =>
        c.expert_user_id === id &&
        isPackageCreditUsable(c) &&
        (requiredPackageDuration == null || c.session_duration_minutes === requiredPackageDuration),
    );
  }, [learnerPackageCredits, id, requiredPackageDuration]);

  const activePackageCredit = usableExpertCredits[0] ?? null;
  const canBookSessions = !packageRequired || usableExpertCredits.length > 0;

  useEffect(() => {
    if (!packagePurchaseOpen || !id || !packageOffered) {
      if (!packagePurchaseOpen) setPackageOffer(null);
      return;
    }
    let cancelled = false;
    setPackageOfferLoading(true);
    void fetch(`/api/experts/${encodeURIComponent(id)}/package-offer`)
      .then((r) => r.json() as Promise<{ offer?: PackageOfferPreview | null }>)
      .then((j) => {
        if (!cancelled) setPackageOffer(j.offer ?? null);
      })
      .catch(() => {
        if (!cancelled) setPackageOffer(null);
      })
      .finally(() => {
        if (!cancelled) setPackageOfferLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [packagePurchaseOpen, id, packageOffered]);

  function openPackagePurchaseDialog() {
    setPackagePurchaseOpen(true);
  }

  function handlePickBookingSlot(utcMs: number) {
    if (packageRequired && !canBookSessions) {
      openPackagePurchaseDialog();
      return;
    }
    setBookingAnchorUtc(utcMs);
    setBookingOpen(true);
  }

  useEffect(() => {
    if (loading || !expert) return;
    const vis = String(expert.expert_visibility_state ?? "");
    if (vis && !isExpertProfilePubliclyViewable(vis)) return;
    const raw = searchParams.get("slotStart");
    if (!raw) return;
    const ms = parseSlotStartUtcMs(raw);
    if (ms == null) return;
    if (!canBookSessions) {
      if (packageRequired) setPackagePurchaseOpen(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete("slotStart");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      return;
    }
    setBookingAnchorUtc(ms);
    setBookingOpen(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("slotStart");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [loading, expert, searchParams, pathname, router, canBookSessions, packageRequired]);

  const viewerTimeZoneIana =
    signedIn && typeof me?.profile?.time_zone === "string" && me.profile.time_zone.trim()
      ? me.profile.time_zone.trim()
      : "";

  const bookingBlockingIntervals = useMemo((): ExpertBlockingInterval[] => {
    const raw = expert?.booking_blocking_intervals;
    return Array.isArray(raw) ? (raw as ExpertBlockingInterval[]) : [];
  }, [expert?.booking_blocking_intervals]);

  const bookingPreview = useMemo((): BookingWeekPreview | null => {
    const fallback = (expert?.booking_week_preview as BookingWeekPreview | null) ?? null;
    const expertTz = expert ? String(expert.time_zone ?? "").trim() : "";
    if (!availabilityForBooking || !expertTz) return fallback;
    const previewOptions = { blockingIntervals: bookingBlockingIntervals };
    if (signedIn && viewerTimeZoneIana) {
      const v = computeBookingWeekPreview(availabilityForBooking, expertTz, new Date(), {
        displayTimeZone: viewerTimeZoneIana,
        ...previewOptions,
      });
      if (v) return v;
    }
    return fallback;
  }, [availabilityForBooking, expert, signedIn, viewerTimeZoneIana, bookingBlockingIntervals]);

  const bookingTzName = bookingPreview?.timezoneNameLabel;

  const minBookingMinutesNum = expert ? parseMinBookingMinutes(expert.minimum_booking) : 30;
  const maxBookingMinutesNum = expert
    ? intervalStringToMinutes(expert.maximum_booking) ?? 24 * 60
    : 24 * 60;

  const minimumNoticeLabel = minimumNotice
    ? String(minimumNotice).replace(/^(\d{2}):(\d{2}):\d{2}$/, (_m, h, m) => {
        const mins = Number(h) * 60 + Number(m);
        if (mins <= 0) return "Not set";
        if (mins < 60) return `${mins} min`;
        const hours = Math.floor(mins / 60);
        const remainder = mins % 60;
        if (remainder === 0) return `${hours} hr`;
        return `${hours} hr ${remainder} min`;
      })
    : "Not set";

  const qualificationBadges = useMemo(
    () =>
      [experienceLevel, qualifications]
        .join(",")
        .split(/[\n,;]+/)
        .map((v) => v.trim())
        .filter(Boolean),
    [experienceLevel, qualifications]
  );

  const ratingCounts = useMemo(() => {
    const out = new Map<number, number>([
      [5, 0],
      [4, 0],
      [3, 0],
      [2, 0],
      [1, 0],
    ]);
    for (const r of reviews) {
      const k = Math.max(1, Math.min(5, Math.round(Number(r.overall_rating))));
      out.set(k, (out.get(k) ?? 0) + 1);
    }
    return out;
  }, [reviews]);

  const normalizedSkills = useMemo(
    () =>
      skills
        .flatMap((s) => s.split(/[\n,;]+/))
        .map((s) => s.trim())
        .filter(Boolean),
    [skills]
  );

  const rateLabel = rate > 0 ? formatRatePer15Min(rate) : "Rate on booking";
  const rateMatch = /^(\$[\d,.]+)\s*(.*)$/.exec(rateLabel);
  const rateMain = rateMatch?.[1] ?? rateLabel;
  const rateSuffix = rateMatch?.[2] ?? "";
  const rateAmountDigits = rateMain.startsWith("$") ? rateMain.slice(1) : rateMain;
  const performance = (expert?.performance_highlights as Record<string, unknown> | undefined) ?? {};
  const sessionsComplete =
    performance.sessions_complete != null && Number.isFinite(Number(performance.sessions_complete))
      ? Number(performance.sessions_complete)
      : sessions;
  const performanceCancellationRate =
    performance.cancellation_rate != null && Number.isFinite(Number(performance.cancellation_rate))
      ? Number(performance.cancellation_rate)
      : Number.isFinite(cancellationRate)
        ? cancellationRate
        : null;
  const reliabilityScore =
    performance.reliability_score != null && Number.isFinite(Number(performance.reliability_score))
      ? Number(performance.reliability_score)
      : dependability;
  const performanceItems = [
    {
      key: "sessions",
      active: Boolean(performance.is_most_booked),
      title: "Sessions Complete",
      value: String(sessionsComplete),
      activeLabel: "Most booked",
    },
    {
      key: "cancellations",
      active: Boolean(performance.is_least_cancellations),
      title: "Cancellation Rate",
      value: performanceCancellationRate != null ? `${Math.max(0, performanceCancellationRate)}%` : "—",
      activeLabel: "Least Cancellations",
    },
    {
      key: "reliability",
      active: Boolean(performance.is_most_reliable),
      title: "Dependability Rating",
      value: reliabilityScore > 0 ? formatDependabilityRating(reliabilityScore) : "—",
      activeLabel: "Most Reliable",
    },
  ] as const;

  useEffect(() => {
    if (!expert || isVisible) {
      setSimilar([]);
      return;
    }
    if (!categoryId) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSimilarLoading(true);
      try {
        const res = await fetch(`/api/experts?category=${encodeURIComponent(categoryId)}&limit=12`);
        const data = await res.json();
        if (cancelled) return;
        const list = ((data.experts as ExpertsGridExpert[]) ?? []).filter((e) => e.id !== id).slice(0, 3);
        setSimilar(list);
      } catch {
        if (!cancelled) setSimilar([]);
      } finally {
        if (!cancelled) setSimilarLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expert, isVisible, categoryId, id]);

  return (
    <div className="min-h-screen bg-background">
      <SignInDialog
        open={signInState.open}
        onOpenChange={(open) => setSignInState((s) => ({ ...s, open }))}
        description={signInState.description}
        postSignInRedirect={signInState.redirect}
      />
      <PartnerConversationDialog
        open={messageOpen}
        onOpenChange={setMessageOpen}
        partnerId={id || null}
        partnerName={name || null}
        partnerPhoto={photo}
        partnerExpertVisibilityState={visibility || null}
      />
      <SessionBookingDialog
        open={bookingOpen}
        onOpenChange={(o) => {
          setBookingOpen(o);
          if (!o) setBookingAnchorUtc(null);
        }}
        expertId={id}
        expertName={name}
        expertTitle={title}
        expertPhoto={photo}
        expertVisibilityState={visibility}
        ratePer15Min={rate}
        autoAccept={autoBook}
        minBookingMinutes={minBookingMinutesNum}
        maxBookingMinutes={maxBookingMinutesNum}
        availability={availabilityForBooking}
        expertTimeZone={expert ? String(expert.time_zone ?? "") : null}
        expertTimeZoneDisplayLabel={bookingTzName}
        displayWallTimeZone={signedIn && viewerTimeZoneIana ? viewerTimeZoneIana : null}
        blockingIntervals={bookingBlockingIntervals}
        anchorUtcMs={bookingAnchorUtc}
        firstSessionDiscountAvailable={isFirstSessionDiscountAdvertised(expert) && !activePackageCredit}
        firstSessionDiscountMaxSessionMinutes={
          expert?.first_session_discount_max_session_minutes ?? null
        }
        firstSessionDiscountType={expert?.first_session_discount_type ?? null}
        firstSessionDiscountValue={expert?.first_session_discount_value ?? null}
        viewerHasPaidSession={viewerHasPaidSession}
        packageRequireAfterFirst={packageRequireAfterFirst && !packageRequireImmediate}
        packageCreditId={activePackageCredit?.credit_id ?? null}
        packageCreditDurationMinutes={activePackageCredit?.session_duration_minutes ?? requiredPackageDuration}
        packageCreditRemaining={activePackageCredit?.remaining_credits ?? null}
        onRequestSignIn={() =>
          setSignInState({
            open: true,
            description: "You must be signed in to book a session.",
            redirect: `/experts/${id}`,
          })
        }
      />
      {packageOffered && packageSessions != null && packageDuration != null ? (
        <PackagePurchaseDialog
          open={packagePurchaseOpen}
          onOpenChange={setPackagePurchaseOpen}
          expertUserId={id}
          expertName={name}
          expertTitle={title}
          expertPhoto={photo}
          expertVisibilityState={visibility}
          offer={packageOffer}
          offerLoading={packageOfferLoading}
          onRequestSignIn={
            signedIn
              ? undefined
              : () =>
                  setSignInState({
                    open: true,
                    description: "Sign in to purchase a package.",
                    redirect: `/experts/${id}`,
                  })
          }
        />
      ) : null}
      <div className="border-b border-border bg-card">
        <div className="mx-auto w-full max-w-screen-2xl px-4 py-4 md:px-6">
          <Button variant="ghost" className="gap-1 text-convene-primary" asChild>
            <Link href="/search">
              <ChevronLeft className="h-4 w-4" />
              Back to search
            </Link>
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-2xl px-4 py-8 md:px-6">
        {err ? (
          <p className="text-destructive">{err}</p>
        ) : loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : !expert ? (
          <p className="text-muted-foreground">Expert not found.</p>
        ) : !isVisible ? (
          <div className="space-y-8">
            <Card className="border-2 border-border shadow-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="text-convene-primary">{name}</CardTitle>
                <p className="text-sm text-muted-foreground">This expert profile isn’t public yet.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {category ? (
                  <Badge variant="outline" className="border-convene-hero text-convene-hero">
                    {category}
                  </Badge>
                ) : null}
                <p className="text-sm text-muted-foreground">Try searching for a similar expert in the meantime.</p>
              </CardContent>
            </Card>

            <section>
              <h2 className="mb-4 text-lg font-semibold text-foreground">Similar experts</h2>
              {similarLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : similar.length ? (
                <ExpertsGrid experts={similar} />
              ) : (
                <p className="text-sm text-muted-foreground">No similar experts yet.</p>
              )}
            </section>
          </div>
        ) : (
          <>
            <Card className="overflow-hidden border-2 border-border shadow-md">
              <CardContent className="p-6 md:p-8">
                <div className="grid gap-6 lg:grid-cols-[180px_1fr_320px] lg:items-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="relative h-36 w-36">
                      <Avatar className="h-full w-full border-4 border-border shadow-lg">
                        <AvatarImage src={photo ?? undefined} alt={name} className="object-cover" />
                        <AvatarFallback className="bg-convene-hero text-3xl text-white">{initials}</AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="mt-3 flex w-full max-w-[180px] flex-col items-center space-y-2">
                      <OnlineNowPill online={online && !availableNow} />
                      <AvailableNowPill availableNow={availableNow} />
                    </div>
                  </div>

                  <div className="flex flex-col justify-center space-y-2">
                    <div className="space-y-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                        <h1 className="break-words text-3xl font-bold leading-tight text-convene-primary md:text-4xl">
                          {name}
                        </h1>
                        <VisibleTempDot expertVisibilityState={visibility} variant="inline" className="h-2.5 w-2.5" />
                        {verified ? <VerifiedExpertBadge /> : null}
                        {avg != null && avg >= 4 ? (
                          <Badge className="shrink-0" variant="secondary">
                            Top rated
                          </Badge>
                        ) : null}
                        {Number.isFinite(dependabilityRating) && dependabilityRating > 90 ? (
                          <Badge className="shrink-0 gap-1" variant="secondary">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Most Reliable
                          </Badge>
                        ) : null}
                        <FirstSessionDiscountBadge expert={expert} />
                        <SessionPackagesBadge expert={expert} publishedPackageCount={packages.length} />
                      </div>
                      <p className="mt-2 text-lg font-medium leading-tight text-convene-hero">{title}</p>
                    </div>
                    {hometownDisplay ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4 text-convene-primary" />
                          {hometownDisplay}
                        </span>
                      </div>
                    ) : null}
                    {bio ? <p className="line-clamp-2 text-sm text-foreground">{bio}</p> : null}
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        className="shrink-0 bg-convene-primary text-white hover:bg-convene-primary/90"
                        onClick={() => void openMessageThread()}
                      >
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Message Expert
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center border-l-2 border-border py-1 pl-4 md:pl-5">
                    <div className="flex w-max max-w-full flex-col gap-4 text-muted-foreground">
                      <div className="flex min-w-0 items-center">
                        <div className="flex items-center gap-0.5">
                          <span className="inline-flex h-6 w-7 shrink-0 items-center justify-center">
                            {rate > 0 ? (
                              <DollarSign className="h-6 w-6 text-convene-hero" strokeWidth={2.25} aria-hidden />
                            ) : (
                              <span className="inline-block w-6" aria-hidden />
                            )}
                          </span>
                          <span className="inline-flex min-h-6 min-w-[5.5rem] shrink-0 items-center justify-end text-right text-xl font-semibold tabular-nums leading-none text-convene-hero">
                            {rate > 0 ? rateAmountDigits : "—"}
                          </span>
                        </div>
                        <span className="min-w-0 pl-3 text-left text-sm leading-snug text-foreground md:pl-4">
                          {rate > 0 ? rateSuffix : ""}
                        </span>
                      </div>

                      <div className="flex min-w-0 items-center">
                        <div className="flex items-center gap-0.5">
                          <span className="inline-flex h-6 w-7 shrink-0 items-center justify-center">
                            <Star className="h-6 w-6 fill-amber-400 text-amber-400" aria-hidden />
                          </span>
                          <span className="inline-flex min-h-6 min-w-[5.5rem] shrink-0 items-center justify-end text-right text-xl font-semibold tabular-nums leading-none text-foreground">
                            {avg != null && avg > 0 ? avg.toFixed(1) : "—"}
                          </span>
                        </div>
                        <span className="pl-3 text-left text-sm leading-snug text-foreground md:pl-4">
                          {reviews.length > 0 ? reviews.length : 0} reviews
                        </span>
                      </div>

                      <div className="flex min-w-0 items-center">
                        <div className="flex items-center gap-0.5">
                          <span className="inline-flex h-6 w-7 shrink-0 items-center justify-center">
                            <Clock3 className="h-6 w-6" aria-hidden />
                          </span>
                          <span className="inline-flex min-h-6 min-w-[5.5rem] shrink-0 items-center justify-end text-right text-xl font-semibold tabular-nums leading-none text-foreground">
                            {sessions > 0 ? sessions : "—"}
                          </span>
                        </div>
                        <span className="pl-3 text-left text-sm leading-snug text-foreground md:pl-4">sessions</span>
                      </div>

                      <div className="flex min-w-0 items-center">
                        <div className="flex items-center gap-0.5">
                          <span className="inline-flex h-6 w-7 shrink-0 items-center justify-center">
                            <ShieldCheck className="h-6 w-6 text-convene-primary" aria-hidden />
                          </span>
                          <span className="inline-flex min-h-6 min-w-[5.5rem] shrink-0 items-center justify-end text-right text-xl font-semibold tabular-nums leading-none text-foreground">
                            {Number.isFinite(dependabilityRating)
                              ? formatDependabilityRating(dependabilityRating)
                              : "—"}
                          </span>
                        </div>
                        <span className="pl-3 text-left text-sm leading-snug text-foreground md:pl-4">dependability</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <section className="mt-8 space-y-6">
              <div className="grid gap-6 lg:grid-cols-3">
                <Card className="border-2 border-border shadow-sm lg:col-span-2">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-convene-primary">
                      <Calendar className="h-5 w-5 text-convene-hero" />
                      Book a Session
                    </CardTitle>
                    <CardDescription className="space-y-1.5 text-foreground/90">
                      {autoBook ? (
                        <span className="block">Select an available time slot to book your session.</span>
                      ) : (
                        <>
                          <span className="block font-medium text-convene-hero">
                            This expert has opted out of auto-bookings.
                          </span>
                          <span className="block">
                            Click below to request a time, your expert will need to approve the booking before it
                            is final.
                          </span>
                        </>
                      )}
                      {packageOffered && packageSessions != null && packageDuration != null ? (
                        <span className="block space-y-2">
                          <span className="block font-medium text-convene-hero">
                            {packageBookingNotice(packageSessions, packageDuration, {
                              required: packageRequireImmediate,
                              requiredAfterFirst:
                                packageRequireAfterFirst && !packageRequireImmediate,
                              firstSessionConsultationLength,
                              firstSessionConsultationPrice,
                            })}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            className="bg-convene-primary text-white hover:bg-convene-primary/90"
                            onClick={openPackagePurchaseDialog}
                          >
                            Purchase Package
                          </Button>
                        </span>
                      ) : null}
                      <span className="block">
                        {signedIn && viewerTimeZoneIana ? (
                          <>
                            Times are adjusted to display in your hometown timezone (
                            <span className="font-medium text-convene-hero">{viewerTimeZoneIana}</span>
                            ).
                          </>
                        ) : (
                          <>
                            Times displayed in{" "}
                            <span className="font-medium text-convene-hero">{bookingTzName ?? "Pacific Time"}</span>
                            .
                            {!signedIn ? (
                              <>
                                {" "}
                                <button
                                  type="button"
                                  className="font-semibold text-convene-primary underline underline-offset-2 hover:text-convene-primary/90"
                                  onClick={() =>
                                    setSignInState({
                                      open: true,
                                      description: null,
                                      redirect: `/experts/${id}`,
                                    })
                                  }
                                >
                                  Sign In
                                </button>{" "}
                                to view in your home timezone.
                              </>
                            ) : null}
                          </>
                        )}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ExpertWeeklyBookingWidget
                      expertId={id}
                      preview={bookingPreview}
                      onPickSlot={(utcMs) => handlePickBookingSlot(utcMs)}
                    />
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className="border-2 border-border shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-convene-primary">
                        <Clock3 className="h-5 w-5 text-convene-hero" />
                        Session Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm font-semibold text-convene-primary">
                      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                        <p>Minimum Booking:</p>
                        <p>{minimumBookingLabel}</p>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                        <p>Maximum Booking:</p>
                        <p>{maximumBookingLabel}</p>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                        <p>Auto-Booking:</p>
                        <p>{autoBook ? "On" : "Off"}</p>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                        <p>Booking Notice:</p>
                        <p>{minimumNoticeLabel}</p>
                      </div>
                      {isFirstSessionDiscountAdvertised(expert) ? (
                        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                          <p>First Session Discount:</p>
                          <p>Available</p>
                        </div>
                      ) : null}
                      {isSessionPackagesAdvertised(expert) || packages.length > 0 ? (
                        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                          <p>Packages:</p>
                          <p>{packages.length > 0 ? packages.length : "Offered"}</p>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-border shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-convene-primary">
                        <BarChart3 className="h-5 w-5 text-convene-hero" />
                        Performance Highlights
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                      {performanceItems.map((item) => (
                        <div
                          key={item.key}
                          className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold ${
                            item.active ? "bg-convene-hero text-white" : "bg-convene-primary text-white"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {item.key === "sessions" ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : item.key === "reliability" ? (
                              <Clock3 className="h-5 w-5" />
                            ) : (
                              <Star className="h-5 w-5" />
                            )}
                            <span>{item.active ? item.activeLabel : item.title}</span>
                          </div>
                          {item.active ? null : <span className="text-2xl font-bold leading-none">{item.value}</span>}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6">
                  <Card className="border-2 border-border shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-convene-primary">
                        <GraduationCap className="h-5 w-5 text-convene-hero" />
                        Education & Qualifications
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {qualificationBadges.length ? (
                        <div className="flex flex-wrap gap-2">
                          {qualificationBadges.map((q) => (
                            <Badge key={q} className="rounded-full bg-[#003049] text-white hover:bg-[#003049]">
                              {q}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Not provided</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-border shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-convene-primary">
                        <Wrench className="h-5 w-5 text-convene-hero" />
                        Skills & Specializations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {normalizedSkills.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {normalizedSkills.map((s) => (
                            <Badge key={s} className="rounded-full bg-[#003049] text-white hover:bg-[#003049]">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No skills listed.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-2 border-border shadow-sm lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-convene-primary">
                      <BookOpen className="h-5 w-5 text-convene-hero" />
                      About {name.split(" ")[0] || "Expert"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-lg font-bold text-foreground">Professional Bio</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {bio || "No professional bio yet."}
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground">About My Services</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {about || "No service details yet."}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-convene-primary">
                    <Star className="h-5 w-5 text-convene-hero" />
                    Reviews ({reviews.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-6 rounded-lg border border-border bg-white p-5 md:grid-cols-[220px_1fr]">
                    <div className="text-center md:text-left">
                      <p className="text-6xl font-bold leading-none text-convene-primary">{avg != null ? avg.toFixed(1) : "0.0"}</p>
                      <div className="mt-2 flex items-center justify-center gap-1 md:justify-start">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const filled = avg != null ? i < Math.round(avg) : false;
                          return (
                            <Star
                              key={`sum-star-${i}`}
                              className={`h-5 w-5 ${filled ? "fill-[#f5c11d] text-[#f5c11d]" : "text-gray-300"}`}
                            />
                          );
                        })}
                      </div>
                      <p className="mt-1 text-xl text-convene-primary">Based on {reviews.length} reviews</p>
                    </div>
                    <div className="max-w-md space-y-2">
                      {[5, 4, 3, 2, 1].map((n) => {
                        const c = ratingCounts.get(n) ?? 0;
                        const pct = reviews.length > 0 ? Math.round((c / reviews.length) * 100) : 0;
                        return (
                          <div key={`dist-${n}`} className="flex items-center gap-3 text-sm text-convene-primary">
                            <span className="w-8 text-right font-semibold">{n} ★</span>
                            <div className="h-3 flex-1 rounded-full bg-gray-200">
                              <div className="h-3 rounded-full bg-[#f5c11d]" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-8 text-right font-medium">{c}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <Separator />
                  {reviews.length === 0 ? (
                    <p className="text-muted-foreground">No reviews yet.</p>
                  ) : (
                    reviews.map((r) => {
                      const reviewerName = r.reviewer_name?.trim() || "Community Member";
                      return (
                      <div key={r.review_id} className="rounded-md px-1 py-2">
                        <div className="flex items-start gap-3">
                          <Avatar className="h-10 w-10">
                            {r.reviewer_photo ? (
                              <AvatarImage src={r.reviewer_photo} alt="" />
                            ) : null}
                            <AvatarFallback className="bg-[#ecd9c8] text-convene-primary">
                              {reviewerName.slice(0, 1).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-lg font-bold text-foreground">{reviewerName}</p>
                            <div className="mt-1 flex items-center gap-2">
                              <div className="flex items-center gap-0.5">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star
                                    key={`row-${r.review_id}-${i}`}
                                    className={`h-4 w-4 ${
                                      i < Math.round(r.overall_rating) ? "fill-[#f5c11d] text-[#f5c11d]" : "text-gray-300"
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {new Date(r.created_at).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </span>
                            </div>
                            {r.public_review ? (
                              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{r.public_review}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </section>

          </>
        )}
      </div>
    </div>
  );
}

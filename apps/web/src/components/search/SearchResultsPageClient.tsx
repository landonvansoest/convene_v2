"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingDots } from "@/components/ui/loading-dots";
import {
  ArrowUpDown,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Clock3,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import { DashboardViewHeader } from "@/app/dashboard/DashboardViewShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OnlineNowPill } from "@/components/presence/OnlineDot";
import { VisibleTempDot } from "@/components/presence/VisibleTempDot";
import type { HydratedExpert } from "@/lib/experts/hydrate";
import { resolveCategoryIdForSearch, isUuid } from "@/lib/searchCategory";
import { AdvancedSearchDialog } from "@/components/search/AdvancedSearchDialog";
import { BrowseCategoriesDialog } from "@/components/search/BrowseCategoriesDialog";
import { PostRequestDialog } from "@/components/requests/PostRequestDialog";
import { SignInDialog } from "@/components/auth/SignInDialog";
import { SignUpDialog } from "@/components/auth/SignUpDialog";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { RATE_LABEL_SHORT } from "@/lib/rates";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ApiExpert = HydratedExpert;

function SearchInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const qParam = searchParams.get("q") ?? searchParams.get("search") ?? "";
  const categoryParam = searchParams.get("category") ?? "";
  // Hidden debug override — production users never set this; URL ?mode=keyword
  // bypasses OpenAI expansion. Default (no param) is hybrid via the API route.
  const modeParam = searchParams.get("mode") ?? "";
  const verifiedParam = searchParams.get("verified") === "1";
  const availableParam = searchParams.get("available") === "1";
  const minRatingParam = Number(searchParams.get("min_rating") ?? "");
  const maxRateUrl = searchParams.get("max_rate");
  const skillsParam = searchParams.get("skills") ?? "";
  const advancedParam = searchParams.get("advanced") === "1";

  const [experts, setExperts] = useState<ApiExpert[]>([]);
  const [categories, setCategories] = useState<{ category_id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<string>("best-match");
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [uiAvailableNow, setUiAvailableNow] = useState(availableParam);
  const [uiOnlineNow, setUiOnlineNow] = useState(false);
  const [uiVerified, setUiVerified] = useState(verifiedParam);
  const [uiLanguage, setUiLanguage] = useState("all");
  const [uiTimeZone, setUiTimeZone] = useState("all");
  const [uiMinRate, setUiMinRate] = useState("");
  const [uiMaxRate, setUiMaxRate] = useState(
    maxRateUrl && Number.isFinite(Number(maxRateUrl)) ? String(maxRateUrl) : ""
  );
  const [appliedAvailableNow, setAppliedAvailableNow] = useState(availableParam);
  const [appliedOnlineNow, setAppliedOnlineNow] = useState(false);
  const [appliedVerified, setAppliedVerified] = useState(verifiedParam);
  const [appliedLanguage, setAppliedLanguage] = useState("all");
  const [appliedTimeZone, setAppliedTimeZone] = useState("all");
  const [appliedMinRate, setAppliedMinRate] = useState("");
  const [appliedMaxRate, setAppliedMaxRate] = useState(
    maxRateUrl && Number.isFinite(Number(maxRateUrl)) ? String(maxRateUrl) : ""
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signUpOpen, setSignUpOpen] = useState(false);
  const [postSignInMessage, setPostSignInMessage] = useState<string | null>(null);
  const [messageUsOpen, setMessageUsOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [pickedSlotByExpert, setPickedSlotByExpert] = useState<Record<string, string>>({});
  const autoAdvancedRef = useRef(false);

  const skillTokens = useMemo(
    () =>
      skillsParam
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    [skillsParam]
  );

  useEffect(() => {
    setUiAvailableNow(availableParam);
    setAppliedAvailableNow(availableParam);
  }, [availableParam]);

  useEffect(() => {
    if (maxRateUrl && Number.isFinite(Number(maxRateUrl))) {
      const v = String(maxRateUrl);
      setUiMaxRate(v);
      setAppliedMaxRate(v);
    }
  }, [maxRateUrl]);

  useEffect(() => {
    if (advancedParam && !autoAdvancedRef.current) {
      autoAdvancedRef.current = true;
      setAdvancedOpen(true);
    }
  }, [advancedParam]);

  useEffect(() => {
    try {
      const sb = createBrowserSupabase();
      void sb.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
      const { data: sub } = sb.auth.onAuthStateChange((_e, sess) => setSignedIn(!!sess));
      return () => sub.subscription.unsubscribe();
    } catch {
      setSignedIn(false);
      return;
    }
  }, []);

  const resolvedCategoryId = useMemo(
    () => resolveCategoryIdForSearch(categoryParam, categories),
    [categoryParam, categories]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const catRes = await fetch("/api/categories");
      const catJson = await catRes.json();
      const cats = (catJson.categories as { category_id: string; name: string }[]) ?? [];
      if (cancelled) return;
      if (catRes.ok) setCategories(cats);

      const resolved = resolveCategoryIdForSearch(categoryParam, cats);
      const params = new URLSearchParams();
      if (qParam.trim()) params.set("q", qParam.trim());
      if (modeParam) params.set("mode", modeParam);
      if (resolved && isUuid(resolved)) params.set("category", resolved);
      if (appliedVerified) params.set("verified", "1");
      if (appliedAvailableNow) params.set("available_now", "1");
      if (appliedOnlineNow) params.set("online_now", "1");
      if (Number.isFinite(minRatingParam) && minRatingParam > 0) {
        params.set("min_rating", String(minRatingParam));
      }
      const maxRateNum = appliedMaxRate.trim() ? Number(appliedMaxRate) : null;
      if (maxRateNum != null && Number.isFinite(maxRateNum)) {
        params.set("max_rate", String(maxRateNum));
      }
      for (const tok of skillTokens) {
        params.append("skill", tok);
      }
      params.set("limit", "48");

      // Bible §"Search engine contract": route handles keyword/semantic/hybrid;
      // /api/experts is no longer used for the search page. Default mode is
      // `hybrid` (route default) — chunk 2 ships keyword-only and the route
      // advertises mode_used so the UI can show a fallback notice later.
      const exRes = await fetch(`/api/search/experts?${params.toString()}`);
      const exJson = await exRes.json();
      if (cancelled) return;
      if (!exRes.ok) {
        setError(typeof exJson.error === "string" ? exJson.error : "Failed to load");
        setExperts([]);
        setLoading(false);
        return;
      }
      const raw = (exJson.experts as ApiExpert[]) ?? [];
      setExperts(
        raw.map((e) => ({
          ...e,
          skills: Array.isArray(e.skills) ? e.skills : [],
          next_bookable_slots: Array.isArray(e.next_bookable_slots) ? e.next_bookable_slots : [],
        }))
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    qParam,
    modeParam,
    categoryParam,
    appliedVerified,
    appliedAvailableNow,
    appliedOnlineNow,
    minRatingParam,
    appliedMaxRate,
    skillTokens,
  ]);

  function setCategoryFilter(catId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (catId && catId !== "all") params.set("category", catId);
    else params.delete("category");
    router.push(params.toString() ? `/search?${params}` : "/search");
  }

  function openPostRequest() {
    if (signedIn !== true) {
      setPostSignInMessage(
        "You must be signed in to post a request. Sign in now or create a free account to get started."
      );
      setSignInOpen(true);
      return;
    }
    setPostOpen(true);
  }

  const filtered = useMemo(() => {
    // Server (POST /api/search/experts) already applied: category, FTS query,
    // skills overlap, min_rating, max_rate, verified, available_now, online_now.
    // The "best-match" sort order is the server's relevance ranking — preserved
    // by not re-sorting. We only do extras that the server doesn't know about:
    //   - language / time_zone (Bible doesn't list these as filters)
    //   - min_rate (price floor — Bible doesn't list this either)
    //   - non-default sort modes (just reorders the already-ranked set)
    let list = [...experts];
    if (appliedLanguage !== "all") {
      list = list.filter((e) => (e.language ?? "").toLowerCase() === appliedLanguage.toLowerCase());
    }
    if (appliedTimeZone !== "all") {
      list = list.filter((e) => (e.time_zone ?? "").toLowerCase() === appliedTimeZone.toLowerCase());
    }
    const min = appliedMinRate.trim() ? Number(appliedMinRate) : null;
    if (min != null && Number.isFinite(min)) {
      list = list.filter((e) => (e.rate_per_15_min ?? 0) >= min);
    }
    if (sortBy === "highest-rated") {
      list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (sortBy === "next-available") {
      // TODO(bible): true "next-available" should sort by next_bookable_slots[0].start_utc ASC.
      list.sort((a, b) => (b.rate_per_15_min ?? 0) - (a.rate_per_15_min ?? 0));
    } else if (sortBy === "lowest-rate") {
      list.sort((a, b) => (a.rate_per_15_min ?? 0) - (b.rate_per_15_min ?? 0));
    } else if (sortBy === "highest-rate") {
      list.sort((a, b) => (b.rate_per_15_min ?? 0) - (a.rate_per_15_min ?? 0));
    }
    return list;
  }, [experts, appliedLanguage, appliedTimeZone, appliedMinRate, sortBy]);

  const selectCategoryValue = useMemo(() => {
    if (!categoryParam.trim()) return "all";
    const r = resolvedCategoryId;
    if (r && isUuid(r) && categories.some((c) => c.category_id === r)) return r;
    return "all";
  }, [categoryParam, resolvedCategoryId, categories]);

  const searchDisplayName = useMemo(() => {
    if (qParam.trim()) return qParam.trim();
    if (resolvedCategoryId) {
      const cat = categories.find((c) => c.category_id === resolvedCategoryId);
      if (cat?.name) return cat.name;
    }
    return "All Experts";
  }, [qParam, resolvedCategoryId, categories]);

  const languageOptions = useMemo(
    () =>
      Array.from(new Set(experts.map((e) => (e.language ?? "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [experts]
  );

  const timeZoneOptions = useMemo(
    () =>
      Array.from(new Set(experts.map((e) => (e.time_zone ?? "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [experts]
  );

  return (
    <div className="bg-background">
      {/* Dashboard-style flush layout: sidebar pinned to the left edge runs
          from the top of the page (no centered container above it); the page
          header sits inside the main column above the search results. */}
      <div className="flex min-h-screen min-w-0 flex-row">
        <aside className="w-52 shrink-0 self-stretch border-r border-[#003049]/12 bg-white p-4 sm:w-60 sm:p-5 lg:w-72">
          <div className="space-y-2">
            <button
              type="button"
              className="mt-2 flex w-full items-center gap-2 px-0 py-0.5 text-left text-base font-semibold text-convene-primary"
              onClick={() => setSortOpen((v) => !v)}
            >
              <ArrowUpDown className="h-4 w-4 shrink-0 text-[#F77F00]" strokeWidth={2.25} />
              <span className="flex-1">Sort</span>
              {sortOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
              {sortOpen ? (
                <div className="space-y-0 rounded-md bg-muted/40 p-1.5">
                  {[
                    ["best-match", "Best Match"],
                    ["highest-rated", "Highest Rated"],
                    ["next-available", "Next Available"],
                    ["lowest-rate", "Lowest Rate"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSortBy(value)}
                      className={`block w-full rounded px-0 py-0.5 text-left text-sm leading-snug ${
                        sortBy === value
                          ? "rounded-md bg-convene-primary px-2 font-semibold text-white"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                className="mt-1 flex w-full items-center gap-2 px-0 py-0.5 text-left text-base font-semibold text-convene-primary"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <SlidersHorizontal className="h-4 w-4 shrink-0 text-[#F77F00]" strokeWidth={2.25} />
                <span className="flex-1">Filters</span>
                {filtersOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {filtersOpen ? (
                <div className="space-y-2 rounded-md bg-muted/40 p-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="f-available" className="text-sm">Available now</Label>
                      <Switch id="f-available" checked={uiAvailableNow} onCheckedChange={setUiAvailableNow} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="f-online" className="text-sm">Online now</Label>
                      <Switch id="f-online" checked={uiOnlineNow} onCheckedChange={setUiOnlineNow} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="f-verified" className="text-sm">Verified</Label>
                      <Switch id="f-verified" checked={uiVerified} onCheckedChange={setUiVerified} />
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <Label>Language</Label>
                    <Select value={uiLanguage} onValueChange={setUiLanguage}>
                      <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {languageOptions.map((l) => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-0.5">
                    <Label>Time Zone</Label>
                    <Select value={uiTimeZone} onValueChange={setUiTimeZone}>
                      <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {timeZoneOptions.map((tz) => (
                          <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Min</Label>
                      <Input value={uiMinRate} onChange={(e) => setUiMinRate(e.target.value)} type="number" />
                    </div>
                    <div>
                      <Label>Max</Label>
                      <Input value={uiMaxRate} onChange={(e) => setUiMaxRate(e.target.value)} type="number" />
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="w-full bg-convene-primary text-white hover:bg-convene-primary/90"
                    onClick={() => {
                      setAppliedAvailableNow(uiAvailableNow);
                      setAppliedOnlineNow(uiOnlineNow);
                      setAppliedVerified(uiVerified);
                      setAppliedLanguage(uiLanguage);
                      setAppliedTimeZone(uiTimeZone);
                      setAppliedMinRate(uiMinRate);
                      setAppliedMaxRate(uiMaxRate);
                    }}
                  >
                    Apply
                  </Button>
                </div>
              ) : null}

              <div className="border-t border-border/80" />

              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start gap-2 px-0 py-1 text-left text-base font-semibold text-convene-primary hover:bg-transparent"
                onClick={() => setAdvancedOpen(true)}
              >
                <Settings2 className="h-4 w-4 shrink-0 text-[#F77F00]" strokeWidth={2.25} />
                <span>Advanced Search</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start gap-2 px-0 py-1 text-left text-base font-semibold text-convene-primary hover:bg-transparent"
                onClick={() => openPostRequest()}
              >
                <Plus className="h-4 w-4 shrink-0 text-[#F77F00]" strokeWidth={2.25} />
                <span>Post a Request</span>
              </Button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-x-auto px-3 py-6 sm:px-4 lg:px-6 lg:py-8">
          <DashboardViewHeader
            Icon={Search}
            title={
              searchDisplayName
                ? `Expert Search Results for “${searchDisplayName}”`
                : "Expert Search Results"
            }
          />

          <div className="mt-6">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

              {loading ? (
                <div className="flex justify-center py-20">
                  <LoadingDots />
                </div>
              ) : filtered.length === 0 ? (
                <div className="space-y-4 rounded-xl border border-border bg-card p-10 text-left">
                  <p className="text-muted-foreground">
                    Hmm, we can&apos;t find the perfect expert based on your request.
                    <br />
                    Try to{" "}
                    <button
                      type="button"
                      className="font-medium text-convene-primary underline underline-offset-2"
                      onClick={() => setBrowseOpen(true)}
                    >
                      Browse by Category
                    </button>
                    , an{" "}
                    <button
                      type="button"
                      className="font-medium text-convene-primary underline underline-offset-2"
                      onClick={() => setAdvancedOpen(true)}
                    >
                      Advanced Search
                    </button>
                    , or{" "}
                    <button
                      type="button"
                      className="font-medium text-convene-primary underline underline-offset-2"
                      onClick={() => openPostRequest()}
                    >
                      Post a Request
                    </button>
                    .
                  </p>
                  <p className="text-sm italic text-muted-foreground">
                    Have suggestions for how we can better serve our community? Please{" "}
                    <button
                      type="button"
                      className="font-medium text-convene-primary underline underline-offset-2"
                      onClick={() => setMessageUsOpen(true)}
                    >
                      message us
                    </button>
                    , we&apos;d love to hear from you.
                  </p>
                </div>
              ) : (
                <div className="mt-4 max-w-none space-y-4">
              {filtered.map((e) => {
                const initials = (e.name || "")
                  .split(/\s+/)
                  .map((p) => p[0] ?? "")
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();
                const title = e.professional_title || e.bio || e.name || "";
                const bioLine = (e.bio ?? "").trim();
                const ratingNum = typeof e.rating === "number" ? e.rating : 0;
                const reviewsCount = Number(e.reviews_count ?? 0);
                const sessionsCount = Number(e.completed_sessions ?? 0);
                const rate = Number(e.rate_per_15_min ?? 0);
                const bookableSlots = e.next_bookable_slots ?? [];
                const pickedStart = pickedSlotByExpert[e.id];
                const bookHref =
                  pickedStart != null
                    ? `/experts/${encodeURIComponent(e.id)}?slotStart=${encodeURIComponent(pickedStart)}`
                    : `/experts/${encodeURIComponent(e.id)}`;
                return (
                  <article
                    key={e.id}
                    className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-sm lg:grid-cols-[2fr_1fr_1fr]"
                  >
                    <div className="grid gap-4 sm:grid-cols-[120px_1fr] sm:items-center lg:pr-2">
                      <div className="flex flex-col items-center gap-2">
                        <div className="relative h-28 w-28">
                          <Avatar className="h-full w-full">
                            <AvatarImage src={e.profile_photo ?? undefined} alt={e.name} className="object-cover" />
                            <AvatarFallback className="bg-muted text-2xl font-semibold text-primary">
                              {initials || "EX"}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <OnlineNowPill online={e.online} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-2xl font-semibold text-convene-primary">{e.name}</h3>
                          <VisibleTempDot expertVisibilityState={e.expert_visibility_state} variant="inline" />
                          {e.is_verified ? (
                            <span className="rounded-full bg-amber-500 px-2 py-1 text-xs font-semibold text-white">
                              Verified Expert
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm font-semibold text-foreground">{title}</p>
                        {bioLine ? <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">{bioLine}</p> : null}
                        <div className="mt-3">
                          <Button asChild variant="outline" className="border-convene-primary text-convene-primary">
                            <Link href={`/expert/${e.id}`}>View Full Profile</Link>
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center px-4 lg:px-5">
                      <div className="flex w-full flex-col items-start gap-4 text-muted-foreground">
                        <div className="inline-flex items-center text-3xl font-bold leading-none text-convene-hero">
                          ${Number.isFinite(rate) ? Math.round(rate) : 0}
                          <span className="ml-1 inline-flex items-center text-base font-medium text-foreground">
                            {RATE_LABEL_SHORT}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
                          <span className="text-xl font-semibold text-foreground">
                            {ratingNum > 0 ? ratingNum.toFixed(1) : "—"}
                          </span>
                          <span className="text-sm">{reviewsCount > 0 ? reviewsCount : 0} reviews</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock3 className="h-6 w-6" />
                          <span className="text-xl font-semibold text-foreground">
                            {sessionsCount > 0 ? sessionsCount : "—"}
                          </span>
                          <span className="text-sm">sessions</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex self-stretch border-l border-border pl-4">
                      <div className="flex h-full w-full min-w-0 flex-col gap-3 p-3">
                        <p className="inline-flex items-center gap-1 text-sm font-semibold text-foreground">
                          <CalendarClock className="h-4 w-4 text-convene-hero" />
                          Next Available Sessions
                        </p>
                        {e.available_now ? (
                          <p className="text-xs text-muted-foreground">
                            Available now
                            {e.available_until
                              ? ` until ${new Date(e.available_until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                              : ""}
                          </p>
                        ) : null}
                        {bookableSlots.length > 0 ? (
                          <div className="flex min-w-0 flex-col gap-2">
                            {bookableSlots.map((s) => (
                              <button
                                key={s.start_utc}
                                type="button"
                                aria-pressed={pickedStart === s.start_utc}
                                onClick={() =>
                                  setPickedSlotByExpert((prev) => ({
                                    ...prev,
                                    [e.id]: s.start_utc,
                                  }))
                                }
                                className={cn(
                                  "inline-flex h-10 w-full items-center justify-start rounded-md border px-4 text-sm font-medium text-white",
                                  "border-convene-primary bg-convene-primary",
                                  pickedStart === s.start_utc &&
                                    "border-convene-hero/55 bg-convene-hero/65 ring-2 ring-convene-hero/40",
                                )}
                              >
                                <span className="block min-w-0 flex-1 overflow-x-auto whitespace-nowrap [scrollbar-width:thin]">
                                  <span className="font-bold">{s.display_date}</span>
                                  <span className="font-normal">{"  |  "}</span>
                                  <span className="font-normal">{s.display_time}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {bookableSlots.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            {e.next_available_summary?.trim()
                              ? e.next_available_summary
                              : "No upcoming times in their published calendar"}
                          </p>
                        ) : null}
                        <Button asChild className="w-full bg-convene-hero text-white hover:opacity-95">
                          <Link href={bookHref}>Book Session</Link>
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
                </div>
              )}
          </div>
        </main>
      </div>

      <AdvancedSearchDialog open={advancedOpen} onOpenChange={setAdvancedOpen} initialKeywords={qParam} />
      <BrowseCategoriesDialog open={browseOpen} onOpenChange={setBrowseOpen} />
      <PostRequestDialog open={postOpen} onOpenChange={setPostOpen} />
      <SignInDialog
        open={signInOpen}
        onOpenChange={(o) => {
          setSignInOpen(o);
          if (!o) setPostSignInMessage(null);
        }}
        description={postSignInMessage}
        onRequestSignUp={() => {
          setSignInOpen(false);
          setSignUpOpen(true);
        }}
      />
      <SignUpDialog
        open={signUpOpen}
        onOpenChange={setSignUpOpen}
        onRequestSignIn={() => {
          setSignUpOpen(false);
          setPostSignInMessage(null);
          setSignInOpen(true);
        }}
      />
      <Dialog open={messageUsOpen} onOpenChange={setMessageUsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message Us</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Open a draft to <span className="font-medium">support@convene.io</span>.
            </p>
            <Button asChild className="w-full bg-convene-primary text-white hover:bg-convene-primary/90">
              <a
                href={`mailto:support@convene.io?subject=${encodeURIComponent("Convene Search Feedback")}&body=${encodeURIComponent("Hi Convene,\n\nI have feedback about search results:\n\n")}`}
              >
                Open message draft
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SearchResultsPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <LoadingDots />
        </div>
      }
    >
      <SearchInner />
    </Suspense>
  );
}

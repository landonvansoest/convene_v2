"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExpertCoachCard } from "@/components/home/ExpertCoachCard";
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
import { Separator } from "@/components/ui/separator";
import { LoadingDots } from "@/components/ui/loading-dots";
import { Filter, MessageSquare, Search as SearchIcon } from "lucide-react";
import type { SearchExpertHit } from "@/lib/searchSemantic";
import { sortExpertsBestMatch } from "@/lib/searchSemantic";
import { resolveCategoryIdForSearch, isUuid } from "@/lib/searchCategory";
import { AdvancedSearchDialog } from "@/components/search/AdvancedSearchDialog";
import { PostRequestDialog } from "@/components/requests/PostRequestDialog";
import { SignInDialog } from "@/components/auth/SignInDialog";
import { SignUpDialog } from "@/components/auth/SignUpDialog";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type ApiExpert = SearchExpertHit;

function SearchInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const qParam = searchParams.get("q") ?? searchParams.get("search") ?? "";
  const categoryParam = searchParams.get("category") ?? "";
  const verifiedParam = searchParams.get("verified") === "1";
  const availableParam = searchParams.get("available") === "1";
  const minRatingParam = Number(searchParams.get("min_rating") ?? "");
  const maxRateUrl = searchParams.get("max_rate");
  const skillsParam = searchParams.get("skills") ?? "";
  const advancedParam = searchParams.get("advanced") === "1";

  const [search, setSearch] = useState(qParam);
  const [experts, setExperts] = useState<ApiExpert[]>([]);
  const [categories, setCategories] = useState<{ category_id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<string>(categoryParam ? "highest-rated" : "best-match");
  const [showAvailableNow, setShowAvailableNow] = useState(availableParam);
  const [minRate, setMinRate] = useState("");
  const [maxRate, setMaxRate] = useState(
    maxRateUrl && Number.isFinite(Number(maxRateUrl)) ? String(maxRateUrl) : ""
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signUpOpen, setSignUpOpen] = useState(false);
  const [postSignInMessage, setPostSignInMessage] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
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
    setSearch(qParam);
  }, [qParam]);

  useEffect(() => {
    setShowAvailableNow(availableParam);
  }, [availableParam]);

  useEffect(() => {
    if (maxRateUrl && Number.isFinite(Number(maxRateUrl))) {
      setMaxRate(String(maxRateUrl));
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
      if (qParam.trim()) params.set("search", qParam.trim());
      if (resolved && isUuid(resolved)) params.set("category", resolved);
      params.set("limit", "48");

      const exRes = await fetch(`/api/experts?${params.toString()}`);
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
        }))
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [qParam, categoryParam]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = search.trim();
    const params = new URLSearchParams(searchParams.toString());
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    const next = params.toString();
    router.push(next ? `/search?${next}` : "/search");
  }

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
    let list = [...experts];
    if (categoryParam && resolvedCategoryId) {
      list = list.filter((e) => e.category_id === resolvedCategoryId);
    }
    if (verifiedParam) {
      list = list.filter((e) => e.is_verified);
    }
    if (skillTokens.length) {
      list = list.filter((e) => {
        const hay = [
          ...(e.skills ?? []),
          e.bio ?? "",
          e.professional_title ?? "",
          e.name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return skillTokens.some((t) => hay.includes(t));
      });
    }
    const minR = Number.isFinite(minRatingParam) && minRatingParam > 0 ? minRatingParam : null;
    if (minR != null) {
      list = list.filter((e) => (e.rating ?? 0) >= minR);
    }
    const min = minRate.trim() ? Number(minRate) : null;
    const max = maxRate.trim() ? Number(maxRate) : null;
    if (min != null && Number.isFinite(min)) {
      list = list.filter((e) => (e.rate_per_15_min ?? 0) >= min);
    }
    if (max != null && Number.isFinite(max)) {
      list = list.filter((e) => (e.rate_per_15_min ?? 0) <= max);
    }
    // "Available now" = bookable slot within 1 hour (Bible). Requires API/availability data — not filtered client-side yet.
    if (sortBy === "best-match" && qParam.trim()) {
      list = sortExpertsBestMatch(qParam, list);
    } else if (sortBy === "highest-rated") {
      list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (sortBy === "lowest-rate") {
      list.sort((a, b) => (a.rate_per_15_min ?? 0) - (b.rate_per_15_min ?? 0));
    } else if (sortBy === "highest-rate") {
      list.sort((a, b) => (b.rate_per_15_min ?? 0) - (a.rate_per_15_min ?? 0));
    }
    return list;
  }, [
    experts,
    categoryParam,
    resolvedCategoryId,
    verifiedParam,
    skillTokens,
    minRatingParam,
    minRate,
    maxRate,
    sortBy,
    qParam,
  ]);

  const selectCategoryValue = useMemo(() => {
    if (!categoryParam.trim()) return "all";
    const r = resolvedCategoryId;
    if (r && isUuid(r) && categories.some((c) => c.category_id === r)) return r;
    return "all";
  }, [categoryParam, resolvedCategoryId, categories]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto max-w-7xl px-4 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-[#003049]">Find an Expert</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Keyword search, advanced filters (v1-style), and category browse.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-[#003049] text-[#003049]"
                onClick={() => setAdvancedOpen(true)}
              >
                <SearchIcon className="mr-2 h-4 w-4" />
                Advanced search
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-[#003049] text-[#003049]"
                onClick={() => openPostRequest()}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Post a Request
              </Button>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find an Expert or Ask a Question"
                className="h-12 rounded-full border-[#003049]/25 pl-10 pr-4"
              />
            </div>
            <Button type="submit" className="h-12 rounded-full bg-[#F77F00] px-8 text-white hover:bg-[#F77F00]/90">
              Search
            </Button>
          </form>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <aside className="w-full shrink-0 space-y-6 lg:w-72">
            <div className="rounded-xl border-2 border-[#003049]/15 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 font-semibold text-[#003049]">
                <Filter className="h-4 w-4" />
                Filters
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={selectCategoryValue}
                    onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.category_id} value={c.category_id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Min $ / 15 min</Label>
                    <Input
                      value={minRate}
                      onChange={(e) => setMinRate(e.target.value)}
                      placeholder="0"
                      type="number"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max $ / 15 min</Label>
                    <Input
                      value={maxRate}
                      onChange={(e) => setMaxRate(e.target.value)}
                      placeholder="250"
                      type="number"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="avail-now" className="text-sm text-muted-foreground">
                    Available now
                  </Label>
                  <Switch
                    id="avail-now"
                    checked={showAvailableNow}
                    onCheckedChange={setShowAvailableNow}
                    disabled
                    title="Search API does not yet return within-1-hour slots; enable after availability endpoint ships."
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Per Bible: expert has a bookable slot within the next hour. Search does not apply this filter until
                  availability is wired in the API.
                </p>
                <Button variant="link" className="h-auto p-0 text-[#003049]" asChild>
                  <Link href="/requests">Open community board</Link>
                </Button>
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {loading ? "Loading…" : `${filtered.length} expert${filtered.length === 1 ? "" : "s"}`}
                {qParam ? ` · “${qParam}”` : ""}
                {verifiedParam ? " · Verified only" : ""}
              </p>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Sort</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="best-match">Best match</SelectItem>
                    <SelectItem value="highest-rated">Highest rated</SelectItem>
                    <SelectItem value="lowest-rate">Lowest rate</SelectItem>
                    <SelectItem value="highest-rate">Highest rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator className="mb-6" />

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {loading ? (
              <div className="flex justify-center py-20">
                <LoadingDots />
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border bg-white p-10 text-center text-muted-foreground">
                No experts match your filters. Try advanced search or clear filters.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4">
                {filtered.map((e) => (
                  <ExpertCoachCard
                    key={e.id}
                    id={e.id}
                    name={e.name}
                    title={
                      [e.professional_title, e.category_name].filter(Boolean).join(" · ") ||
                      e.bio ||
                      e.name
                    }
                    image={e.profile_photo ?? null}
                    rating={e.rating}
                    isVerified={!!e.is_verified}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AdvancedSearchDialog open={advancedOpen} onOpenChange={setAdvancedOpen} initialKeywords={search} />
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
    </div>
  );
}

export function SearchResultsPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <LoadingDots />
        </div>
      }
    >
      <SearchInner />
    </Suspense>
  );
}

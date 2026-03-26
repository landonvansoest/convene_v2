"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SignInDialog } from "@/components/auth/SignInDialog";
import { ExpertWeeklyBookingWidget } from "@/components/expert/ExpertWeeklyBookingWidget";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { formatRatePer15Min } from "@/lib/rates";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Star, MapPin, MessageSquare, Calendar, DollarSign, BadgeCheck, ChevronLeft } from "lucide-react";

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
};

export default function ExpertProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [expert, setExpert] = useState<Record<string, unknown> | null>(null);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avg, setAvg] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyErr, setBuyErr] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [signInForMessageOpen, setSignInForMessageOpen] = useState(false);

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

  async function openMessageThread() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      router.push(`/messages/${id}`);
      return;
    }
    setSignInForMessageOpen(true);
  }

  async function buyPackage(packageId: string) {
    setBuyErr(null);
    setBuyingId(packageId);
    const res = await fetch("/api/stripe/create-package-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId }),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    setBuyingId(null);
    if (!res.ok) {
      if (res.status === 401) {
        setBuyErr("Sign in to purchase a package.");
        return;
      }
      setBuyErr(typeof data.error === "string" ? data.error : "Checkout failed");
      return;
    }
    if (data.url) window.location.href = data.url;
    else setBuyErr("Checkout did not return a URL");
  }

  function firstSessionDiscountTeaser(e: Record<string, unknown> | null): boolean {
    if (!e || !e.first_session_discount_enabled) return false;
    const now = Date.now();
    const from = e.first_session_discount_effective_from;
    if (from) {
      const t = new Date(String(from)).getTime();
      if (Number.isFinite(t) && now < t) return false;
    }
    const until = e.first_session_discount_effective_until;
    if (until) {
      const t = new Date(String(until)).getTime();
      if (Number.isFinite(t) && now > t) return false;
    }
    return true;
  }

  function packageIsPurchasable(p: Pkg) {
    const hasStripePrice = Boolean(p.stripe_price_id?.trim());
    const hasAmount = p.price_cents != null && Number(p.price_cents) > 0;
    return hasStripePrice || hasAmount;
  }

  const name = expert ? String(expert.name ?? expert.email ?? "Expert") : "";
  const title = expert
    ? String(expert.profession ?? expert.experience_level ?? "Expert")
    : "";
  const hometown = expert ? String(expert.hometown ?? "") : "";
  const category = expert ? String(expert.category_name ?? "") : "";
  const bio = expert ? String(expert.expert_bio ?? "") : "";
  const about = expert ? String(expert.about_services ?? "") : "";
  const skills = (expert?.skills_specializations as string[] | undefined) ?? [];
  const rate = expert != null ? Number(expert.rate ?? 0) : 0;
  const verified = Boolean(expert?.is_verified);
  const sessions = expert != null ? Number(expert.complete_sessions ?? 0) : 0;
  const photo = expert?.profile_photo ? String(expert.profile_photo) : null;

  const initials = name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50">
      <SignInDialog
        open={signInForMessageOpen}
        onOpenChange={setSignInForMessageOpen}
        description="Sign in to message this expert."
        postSignInRedirect={`/messages/${id}`}
      />
      <div className="border-b bg-white">
        <div className="container mx-auto max-w-6xl px-4 py-4">
          <Button variant="ghost" className="gap-1 text-[#003049]" asChild>
            <Link href="/search">
              <ChevronLeft className="h-4 w-4" />
              Back to search
            </Link>
          </Button>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl px-4 py-8">
        {err ? (
          <p className="text-destructive">{err}</p>
        ) : loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : !expert ? (
          <p className="text-muted-foreground">Expert not found.</p>
        ) : (
          <>
            <Card className="overflow-hidden border-2 border-[#003049]/15 shadow-md">
              <CardContent className="p-0">
                <div className="grid gap-8 p-6 md:grid-cols-[200px_1fr] md:p-10">
                  <div className="flex flex-col items-center md:items-start">
                    <Avatar className="h-40 w-40 border-4 border-[#003049]/20 shadow-lg">
                      {photo ? (
                        <AvatarImage src={photo} alt={name} className="object-cover" />
                      ) : (
                        <AvatarFallback className="bg-[#F77F00] text-3xl text-white">{initials}</AvatarFallback>
                      )}
                    </Avatar>
                    {verified ? (
                      <Badge className="mt-4 gap-1 bg-[#003049] text-white hover:bg-[#003049]">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        Verified Expert
                      </Badge>
                    ) : null}
                  </div>

                  <div className="min-w-0 space-y-4">
                    <div>
                      <h1 className="text-3xl font-bold text-[#003049] md:text-4xl">{name}</h1>
                      <p className="mt-1 text-lg text-muted-foreground">{title}</p>
                      {category ? (
                        <Badge variant="outline" className="mt-2 border-[#F77F00] text-[#F77F00]">
                          {category}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      {hometown ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4 text-[#003049]" />
                          {hometown}
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        {avg != null ? `${avg.toFixed(1)} avg` : "New expert"}
                        {reviews.length > 0 ? ` · ${reviews.length} reviews` : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-[#003049]" />
                        {sessions} sessions completed
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-[#003049]">
                        <DollarSign className="h-4 w-4" />
                        {rate > 0 ? formatRatePer15Min(rate) : "Rate on booking"}
                      </span>
                    </div>

                    {firstSessionDiscountTeaser(expert) ? (
                      <div className="rounded-lg border border-[#F77F00]/40 bg-[#F77F00]/10 px-4 py-2 text-sm text-[#003049]">
                        First-session discount available on eligible bookings.
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-3 pt-2">
                      <Button className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90" asChild>
                        <Link href={`/sessions?expert=${encodeURIComponent(id)}`}>Book a session</Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-[#003049] text-[#003049]"
                        onClick={() => void openMessageThread()}
                      >
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Message
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="mt-8">
              <ExpertWeeklyBookingWidget expertId={id} expertName={name || "this expert"} />
            </div>

            <div className="mt-8">
              <Tabs defaultValue="about">
                <TabsList className="grid w-full max-w-md grid-cols-3 bg-white">
                  <TabsTrigger value="about">About</TabsTrigger>
                  <TabsTrigger value="packages">Packages</TabsTrigger>
                  <TabsTrigger value="reviews">Reviews</TabsTrigger>
                </TabsList>
                <TabsContent value="about" className="mt-6 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-[#003049]">Bio</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-wrap text-muted-foreground">{bio || "No bio yet."}</p>
                    </CardContent>
                  </Card>
                  {about ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-[#003049]">Services</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="whitespace-pre-wrap text-muted-foreground">{about}</p>
                      </CardContent>
                    </Card>
                  ) : null}
                  {skills.length > 0 ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-[#003049]">Skills</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {skills.map((s) => (
                            <Badge key={s} variant="secondary">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </TabsContent>
                <TabsContent value="packages" className="mt-6">
                  {buyErr ? <p className="mb-4 text-sm text-destructive">{buyErr}</p> : null}
                  {packages.length === 0 ? (
                    <Card>
                      <CardContent className="py-10 text-center text-muted-foreground">
                        No packages published yet.
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {packages.map((p) => (
                        <Card key={p.package_id} className="border-[#003049]/15">
                          <CardHeader>
                            <CardTitle className="text-lg text-[#003049]">{p.title}</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {p.description ? (
                              <p className="text-sm text-muted-foreground">{p.description}</p>
                            ) : null}
                            <p className="text-sm">
                              {p.session_count} sessions × {p.session_duration_minutes} min
                              {p.price_cents != null
                                ? ` · ${(p.price_cents / 100).toFixed(2)} ${p.currency}`
                                : null}
                            </p>
                            {packageIsPurchasable(p) ? (
                              <Button
                                className="bg-[#003049] text-white"
                                disabled={buyingId === p.package_id}
                                onClick={() => void buyPackage(p.package_id)}
                              >
                                {buyingId === p.package_id ? "Redirecting…" : "Purchase"}
                              </Button>
                            ) : null}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="reviews" className="mt-6 space-y-4">
                  {reviews.length === 0 ? (
                    <p className="text-muted-foreground">No reviews yet.</p>
                  ) : (
                    reviews.map((r) => (
                      <Card key={r.review_id}>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-2 text-[#F77F00]">
                            <Star className="h-4 w-4 fill-current" />
                            <span className="font-semibold">{r.overall_rating} / 5</span>
                          </div>
                          {r.public_review ? (
                            <p className="mt-2 text-sm text-muted-foreground">{r.public_review}</p>
                          ) : null}
                          <p className="mt-2 text-xs text-muted-foreground">{r.created_at}</p>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </div>

            <Separator className="my-10" />
            <p className="text-center text-xs text-muted-foreground">
              Expert ID · <span className="font-mono">{id}</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

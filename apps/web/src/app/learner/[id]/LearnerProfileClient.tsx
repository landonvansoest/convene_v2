"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Star, MapPin, MessageSquare, ChevronLeft, Clock3 } from "lucide-react";
import { formatDependabilityRating } from "@/lib/formatDependabilityRating";

type LearnerJson = {
  id: string;
  name: string;
  profile_photo: string | null;
  professional_title: string;
  hometown: string;
  about: string;
  completed_sessions: number;
  dependability_rating: number | null;
};

type ReviewJson = {
  review_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  reviewer_name: string;
};

export function LearnerProfileClient() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [learner, setLearner] = useState<LearnerJson | null>(null);
  const [reviews, setReviews] = useState<ReviewJson[]>([]);
  const [avg, setAvg] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/learners/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Not found");
        setLearner(null);
        setLoading(false);
        return;
      }
      setLearner(data.learner as LearnerJson);
      setReviews((data.reviews as ReviewJson[]) ?? []);
      setAvg(typeof data.average_rating === "number" ? data.average_rating : null);
      setErr(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const initials = (learner?.name ?? "?")
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const ratingCounts = useMemo(() => {
    const out = new Map<number, number>([
      [5, 0],
      [4, 0],
      [3, 0],
      [2, 0],
      [1, 0],
    ]);
    for (const r of reviews) {
      const k = Math.max(1, Math.min(5, Math.round(Number(r.rating))));
      out.set(k, (out.get(k) ?? 0) + 1);
    }
    return out;
  }, [reviews]);

  return (
    <div className="min-h-screen bg-gray-50">
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
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : err || !learner ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {err ?? "Profile not available."}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden border-2 border-border shadow-md">
              <CardContent className="p-6 md:p-8">
                <div className="grid gap-6 lg:grid-cols-[180px_1fr_320px] lg:items-center">
                  <div className="flex flex-col items-center justify-center">
                    <Avatar className="h-36 w-36 border-4 border-border shadow-lg">
                      {learner.profile_photo ? (
                        <AvatarImage src={learner.profile_photo} alt={learner.name} className="object-cover" />
                      ) : (
                        <AvatarFallback className="bg-convene-hero text-3xl text-white">{initials}</AvatarFallback>
                      )}
                    </Avatar>
                  </div>

                  <div className="flex flex-col justify-center space-y-2">
                    <div className="space-y-0">
                      <h1 className="text-3xl font-bold leading-tight text-convene-primary md:text-4xl">
                        {learner.name}
                      </h1>
                      {learner.professional_title ? (
                        <p className="text-lg font-medium leading-tight text-convene-hero">{learner.professional_title}</p>
                      ) : null}
                    </div>
                    {learner.hometown ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4 text-convene-primary" />
                          {learner.hometown}
                        </span>
                      </div>
                    ) : null}
                    {learner.about ? <p className="line-clamp-2 text-sm text-foreground">{learner.about}</p> : null}
                    <Button
                      className="mt-2 w-fit shrink-0 bg-convene-primary text-white hover:bg-convene-primary/90"
                      asChild
                    >
                      <Link href={`/messages/${id}`}>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Message
                      </Link>
                    </Button>
                    {learner.dependability_rating != null ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Badge variant="secondary">
                          Dependability {formatDependabilityRating(learner.dependability_rating)}
                        </Badge>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-center justify-center border-l-2 border-border py-1 pl-4 md:pl-5">
                    <div className="flex w-max max-w-full flex-col gap-4 text-muted-foreground">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex w-8 shrink-0 justify-center">
                          <Star className="h-6 w-6 fill-amber-400 text-amber-400" aria-hidden />
                        </span>
                        <span className="text-xl font-semibold tabular-nums text-foreground">
                          {avg != null && avg > 0 ? avg.toFixed(1) : "—"}
                        </span>
                        <span className="text-sm text-foreground">
                          {reviews.length > 0 ? reviews.length : 0} reviews
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex w-8 shrink-0 justify-center">
                          <Clock3 className="h-6 w-6" aria-hidden />
                        </span>
                        <span className="text-xl font-semibold tabular-nums text-foreground">
                          {learner.completed_sessions > 0 ? learner.completed_sessions : "—"}
                        </span>
                        <span className="text-sm text-foreground">sessions</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {learner.about ? (
              <Card className="mt-8">
                <CardHeader>
                  <CardTitle className="text-[#003049]">About</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-muted-foreground">{learner.about}</p>
                </CardContent>
              </Card>
            ) : null}

            <Card className="mt-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-convene-primary">
                  <Star className="h-5 w-5 text-convene-hero" />
                  Reviews ({reviews.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-6 rounded-lg border border-border bg-white p-5 md:grid-cols-[220px_1fr]">
                  <div className="text-center md:text-left">
                    <p className="text-6xl font-bold leading-none text-convene-primary">
                      {avg != null ? avg.toFixed(1) : "0.0"}
                    </p>
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
                  reviews.map((r) => (
                    <div key={r.review_id} className="rounded-md px-1 py-2">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-[#ecd9c8] text-convene-primary">
                            {(r.reviewer_name || "?").slice(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-xl font-semibold text-convene-primary">{r.reviewer_name}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={`row-${r.review_id}-${i}`}
                                  className={`h-4 w-4 ${
                                    i < Math.round(r.rating) ? "fill-[#f5c11d] text-[#f5c11d]" : "text-gray-300"
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-sm text-convene-primary">
                              {new Date(r.created_at).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                          {r.review_text ? <p className="mt-2 text-2xl text-convene-primary">{r.review_text}</p> : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Star, MapPin, MessageSquare, ChevronLeft, TrendingUp } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto max-w-4xl px-4 py-4">
          <Button variant="ghost" className="gap-1 text-[#003049]" asChild>
            <Link href="/search">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 py-10">
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
            <Card className="overflow-hidden border-2 border-[#003049]/15 shadow-md">
              <CardContent className="p-6 md:p-10">
                <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
                  <Avatar className="h-32 w-32 border-4 border-white shadow-lg">
                    {learner.profile_photo ? (
                      <AvatarImage src={learner.profile_photo} alt={learner.name} />
                    ) : (
                      <AvatarFallback className="bg-[#003049] text-2xl text-white">{initials}</AvatarFallback>
                    )}
                  </Avatar>
                  <div className="min-w-0 flex-1 text-center md:text-left">
                    <h1 className="text-3xl font-bold text-[#003049]">{learner.name}</h1>
                    {learner.professional_title ? (
                      <p className="mt-1 text-lg text-muted-foreground">{learner.professional_title}</p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm text-muted-foreground md:justify-start">
                      {learner.hometown ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {learner.hometown}
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        {avg != null ? `${avg.toFixed(1)} learner rating` : "No ratings yet"}
                      </span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-4 w-4 text-[#003049]" />
                        {learner.completed_sessions} sessions
                      </span>
                      {learner.dependability_rating != null ? (
                        <Badge variant="secondary">Dependability {learner.dependability_rating}</Badge>
                      ) : null}
                    </div>
                    <Button className="mt-6 bg-[#F77F00] text-white hover:bg-[#F77F00]/90" asChild>
                      <Link href={`/messages/${id}`}>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Message
                      </Link>
                    </Button>
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

            <Separator className="my-8" />
            <h2 className="mb-4 text-xl font-semibold text-[#003049]">Reviews from experts</h2>
            {reviews.length === 0 ? (
              <p className="text-muted-foreground">No reviews yet.</p>
            ) : (
              <div className="space-y-4">
                {reviews.map((r) => (
                  <Card key={r.review_id}>
                    <CardContent className="pt-6">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-[#003049]">{r.reviewer_name}</span>
                        <span className="flex items-center gap-1 text-[#F77F00]">
                          <Star className="h-4 w-4 fill-current" />
                          {r.rating} / 5
                        </span>
                      </div>
                      {r.review_text ? (
                        <p className="mt-2 text-sm text-muted-foreground">{r.review_text}</p>
                      ) : null}
                      <p className="mt-2 text-xs text-muted-foreground">{r.created_at}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

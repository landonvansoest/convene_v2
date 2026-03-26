"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const experienceLevels = ["1-2 years", "3-5 years", "6-10 years", "10-20 years", "20+ years"];

type Props = { heading?: string; subheading?: string };

export function ExpertRegistrationForm({
  heading = "Expert registration",
  subheading = "Tell us about your practice. Submissions are reviewed before you appear in search.",
}: Props) {
  const [categories, setCategories] = useState<{ category_id: string; name: string }[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [expertBio, setExpertBio] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [aboutServices, setAboutServices] = useState("");
  const [skills, setSkills] = useState("");
  const [ratePer15, setRatePer15] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories((d.categories as { category_id: string; name: string }[]) ?? []))
      .catch(() => setCategories([]));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setOk(null);
    const rateNum = ratePer15.trim() ? Number(ratePer15) : undefined;
    const res = await fetch("/api/experts/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expert_bio: expertBio,
        qualifications,
        experience_level: experienceLevel,
        about_services: aboutServices,
        skills,
        category_id: categoryId || null,
        rate_per_15_min: rateNum !== undefined && Number.isFinite(rateNum) ? rateNum : undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error ?? "Failed"));
      return;
    }
    setOk(data.message ?? "Saved. Pending review.");
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container mx-auto max-w-3xl px-4">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-[#003049]">{heading}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subheading}</p>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
          <Card className="border-2 border-[#003049]/15">
            <CardHeader>
              <CardTitle>Category & credentials</CardTitle>
              <CardDescription>Matches v1 expert registration structure</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.category_id} value={c.category_id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Experience level</Label>
                <Select value={experienceLevel} onValueChange={setExperienceLevel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {experienceLevels.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Qualifications</Label>
                <Textarea rows={3} value={qualifications} onChange={(e) => setQualifications(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-[#F77F00]/20">
            <CardHeader>
              <CardTitle className="text-[#003049]">Profile & services</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Expert bio</Label>
                <Textarea required rows={5} value={expertBio} onChange={(e) => setExpertBio(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>About your services</Label>
                <Textarea required rows={4} value={aboutServices} onChange={(e) => setAboutServices(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Skills (comma-separated)</Label>
                <Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="React, coaching, …" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-[#003049]/15">
            <CardHeader>
              <CardTitle>Booking preferences</CardTitle>
              <CardDescription>Rate in USD per 15 minutes (v2 convention; v1 hourly ÷ 4)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Rate (USD per 15 minutes)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={ratePer15}
                  onChange={(e) => setRatePer15(e.target.value)}
                  placeholder="e.g. 35"
                />
              </div>
            </CardContent>
          </Card>

          {error ? (
            <p className="text-sm text-destructive">
              {error}{" "}
              {error.includes("Unauthorized") ? (
                <Link href="/login" className="underline">
                  Sign in
                </Link>
              ) : null}
            </p>
          ) : null}
          {ok ? <p className="text-sm text-emerald-600">{ok}</p> : null}

          <Separator />
          <Button type="submit" disabled={saving} className="w-full bg-[#F77F00] py-6 text-lg text-white">
            {saving ? "Submitting…" : "Submit for review"}
          </Button>
        </form>
      </div>
    </div>
  );
}

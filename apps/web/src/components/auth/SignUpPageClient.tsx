"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
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
import { Progress } from "@/components/ui/progress";

const languages = ["English", "Spanish", "French", "German", "Other"];
const genders = ["Male", "Female", "Non-binary", "Prefer not to say"];

export function SignUpPageClient() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [profession, setProfession] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [hometown, setHometown] = useState("");
  const [birthday, setBirthday] = useState("");
  const [gender, setGender] = useState("");
  const [language, setLanguage] = useState("English");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const progress = ((step + 1) / 3) * 100;

  async function submitAll() {
    setErr(null);
    if (!gender) {
      setErr("Please select gender.");
      return;
    }
    setBusy(true);
    try {
      const origin = window.location.origin;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
          data: { first_name: firstName.trim(), last_name: lastName.trim() },
        },
      });
      if (error) {
        setErr(error.message);
        setBusy(false);
        return;
      }
      if (!data.session) {
        setErr("Check your email to confirm your account, then sign in.");
        setBusy(false);
        return;
      }
      const patch = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone_number: phoneNumber.trim() || null,
        profession: profession.trim() || null,
        introduction: introduction.trim() || null,
        hometown: hometown.trim() || null,
        birthday: birthday.trim() || null,
        gender: gender || null,
        language: language || null,
      };
      const me = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!me.ok) {
        const j = await me.json();
        setErr(typeof j.error === "string" ? j.error : "Profile save failed");
        setBusy(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container mx-auto max-w-lg px-4">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-[#003049]">Create your account</h1>
          <p className="mt-2 text-sm text-muted-foreground">v1-style registration</p>
          <Progress value={progress} className="mt-4 h-2" />
        </div>

        {step === 0 ? (
          <Card className="border-2 border-[#003049]/15">
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Email and password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password (min 8)</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button
                type="button"
                className="w-full bg-[#F77F00] text-white"
                onClick={() => {
                  if (!email.includes("@") || password.length < 8) {
                    setErr("Valid email and 8+ character password required.");
                    return;
                  }
                  setErr(null);
                  setStep(1);
                }}
              >
                Continue
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {step === 1 ? (
          <Card className="border-2 border-[#003049]/15">
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Name and professional details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>First name</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Last name</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Professional title</Label>
                <Input value={profession} onChange={(e) => setProfession(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>About you</Label>
                <Textarea
                  rows={4}
                  value={introduction}
                  onChange={(e) => setIntroduction(e.target.value)}
                  required
                  minLength={10}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-[#003049] text-white"
                  onClick={() => {
                    if (!firstName.trim() || !lastName.trim() || !profession.trim() || introduction.trim().length < 10) {
                      setErr("Fill all fields; about must be at least 10 characters.");
                      return;
                    }
                    setErr(null);
                    setStep(2);
                  }}
                >
                  Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card className="border-2 border-[#003049]/15">
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>Location and preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Phone (optional)</Label>
                <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hometown</Label>
                <Input value={hometown} onChange={(e) => setHometown(e.target.value)} placeholder="City, State, Country" required />
              </div>
              <div className="space-y-2">
                <Label>Birthday</Label>
                <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {genders.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {err ? <p className="text-sm text-destructive">{err}</p> : null}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-[#F77F00] text-white"
                  disabled={busy}
                  onClick={() => void submitAll()}
                >
                  {busy ? "Creating…" : "Create account"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[#003049] underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

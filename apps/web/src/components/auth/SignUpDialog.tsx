"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const languages = ["English", "Spanish", "French", "German", "Other"];
const genders = ["Male", "Female", "Non-binary", "Prefer not to say"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestSignIn?: () => void;
};

export function SignUpDialog({ open, onOpenChange, onRequestSignIn }: Props) {
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
  const [message, setMessage] = useState<string | null>(null);

  const progress = ((step + 1) / 3) * 100;

  function reset() {
    setMessage(null);
    setStep(0);
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setPhoneNumber("");
    setProfession("");
    setIntroduction("");
    setHometown("");
    setBirthday("");
    setGender("");
    setLanguage("English");
  }

  async function submitAll(e: FormEvent) {
    e.preventDefault();
    if (!gender) {
      setMessage("Please select gender.");
      return;
    }
    setBusy(true);
    setMessage(null);
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
      setBusy(false);
      setMessage(error.message);
      return;
    }
    if (!data.session) {
      setBusy(false);
      setMessage("Check your email to confirm your account, then sign in.");
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
    setBusy(false);
    if (!me.ok) {
      const j = (await me.json()) as { error?: string };
      setMessage(typeof j.error === "string" ? j.error : "Profile save failed");
      return;
    }
    onOpenChange(false);
    reset();
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-[#003049]">
            <UserPlus className="h-5 w-5 text-primary" />
            Create your account
          </DialogTitle>
          <DialogDescription>
            v1-style 3-step wizard (same fields as <Link href="/signup">/signup</Link>). Step {step + 1} of 3.
          </DialogDescription>
        </DialogHeader>

        <Progress value={progress} className="h-1.5" />

        {step === 0 ? (
          <div className="space-y-3 pt-1">
            <div className="space-y-2">
              <Label htmlFor="su-d-email">Email</Label>
              <Input
                id="su-d-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-d-password">Password (min 8)</Label>
              <Input
                id="su-d-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <Button
              type="button"
              className="w-full bg-[#F77F00] text-white"
              onClick={() => {
                if (!email.includes("@") || password.length < 8) {
                  setMessage("Valid email and 8+ character password required.");
                  return;
                }
                setMessage(null);
                setStep(1);
              }}
            >
              Continue
            </Button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="su-d-first">First name</Label>
                <Input
                  id="su-d-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="su-d-last">Last name</Label>
                <Input
                  id="su-d-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-d-prof">Professional title</Label>
              <Input
                id="su-d-prof"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-d-intro">About you</Label>
              <Textarea
                id="su-d-intro"
                rows={3}
                value={introduction}
                onChange={(e) => setIntroduction(e.target.value)}
                required
                minLength={10}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button
                type="button"
                className="flex-1 bg-[#003049] text-white"
                onClick={() => {
                  if (
                    !firstName.trim() ||
                    !lastName.trim() ||
                    !profession.trim() ||
                    introduction.trim().length < 10
                  ) {
                    setMessage("Fill all fields; about must be at least 10 characters.");
                    return;
                  }
                  setMessage(null);
                  setStep(2);
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <form onSubmit={(e) => void submitAll(e)} className="space-y-3 pt-1">
            <div className="space-y-2">
              <Label htmlFor="su-d-phone">Phone (optional)</Label>
              <Input
                id="su-d-phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                autoComplete="tel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-d-town">Hometown</Label>
              <Input
                id="su-d-town"
                value={hometown}
                onChange={(e) => setHometown(e.target.value)}
                placeholder="City, State, Country"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-d-bday">Birthday</Label>
              <Input
                id="su-d-bday"
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                required
              />
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
            {message ? (
              <p
                className={
                  message.startsWith("Check") ? "text-sm text-emerald-600" : "text-sm text-destructive"
                }
              >
                {message}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="submit" className="flex-1 bg-[#F77F00] text-white" disabled={busy}>
                {busy ? "Creating…" : "Create account"}
              </Button>
            </div>
          </form>
        ) : null}

        {step === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              className="font-medium text-primary underline underline-offset-2"
              onClick={() => {
                onOpenChange(false);
                reset();
                onRequestSignIn?.();
              }}
            >
              Sign in
            </button>
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

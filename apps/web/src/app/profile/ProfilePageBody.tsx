"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { buildRegistrationProfilePatch } from "@/lib/profile/registration-profile";
import { ProfileDashboardSettings } from "./ProfileDashboardSettings";

type Profile = Record<string, unknown>;

function ProfilePageSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [hometown, setHometown] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [language, setLanguage] = useState("");
  const [profession, setProfession] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [birthday, setBirthday] = useState("");
  const [gender, setGender] = useState("");
  const [photo, setPhoto] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      const res = await fetch("/api/me");
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to load profile");
        setLoading(false);
        return;
      }
      if (!data.user) {
        setError("Sign in to edit your profile.");
        setLoading(false);
        return;
      }
      const p = data.profile as Profile | null;
      setProfile(p);
      if (p) {
        setFirstName(String(p.first_name ?? ""));
        setLastName(String(p.last_name ?? ""));
        setPhone(String(p.phone_number ?? ""));
        setHometown(String(p.hometown ?? ""));
        setTimeZone(String(p.time_zone ?? ""));
        setLanguage(String(p.language ?? ""));
        setProfession(String(p.profession ?? ""));
        setIntroduction(String(p.introduction ?? ""));
        setBirthday(p.birthday ? String(p.birthday).slice(0, 10) : "");
        setGender(String(p.gender ?? ""));
        setPhoto(String(p.profile_photo ?? ""));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setOk(null);
    const patch = buildRegistrationProfilePatch({
      firstName,
      lastName,
      phoneNumber: phone,
      hometown,
      timeZone,
      language,
      profession,
      introduction,
      birthday,
      gender,
      profilePhotoUrl: photo.trim() || null,
    });
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Save failed");
      return;
    }
    setProfile(data.profile as Profile);
    setOk("Saved.");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
        <p className="mx-auto max-w-xl text-white/80">Loading…</p>
      </div>
    );
  }

  const formInner = profile ? (
    <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-white/90">First name</span>
          <input
            className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm text-white/90">Last name</span>
          <input
            className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </label>
      </div>
      <label className="block">
        <span className="text-sm text-white/90">Phone</span>
        <input
          className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-sm text-white/90">Hometown</span>
        <input
          className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
          value={hometown}
          onChange={(e) => setHometown(e.target.value)}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-white/90">Time zone</span>
          <input
            className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
            placeholder="e.g. America/New_York"
          />
        </label>
        <label className="block">
          <span className="text-sm text-white/90">Language</span>
          <input
            className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          />
        </label>
      </div>
      <label className="block">
        <span className="text-sm text-white/90">Profession</span>
        <input
          className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
          value={profession}
          onChange={(e) => setProfession(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-sm text-white/90">Introduction</span>
        <textarea
          rows={4}
          className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
          value={introduction}
          onChange={(e) => setIntroduction(e.target.value)}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-white/90">Birthday</span>
          <input
            type="date"
            className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm text-white/90">Gender</span>
          <input
            className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
          />
        </label>
      </div>
      <label className="block">
        <span className="text-sm text-white/90">Profile photo URL</span>
        <input
          className="mt-1 w-full rounded-md border border-white/25 bg-black/25 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
          value={photo}
          onChange={(e) => setPhoto(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-md bg-[var(--convene-hero)] py-2.5 font-medium text-[var(--convene-primary)] disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save profile"}
      </button>
    </form>
  ) : null;

  return (
    <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
      <div className="mx-auto max-w-xl">
        <p className="mb-2 text-sm uppercase tracking-widest text-[var(--convene-hero)]">Account</p>
        <h1 className="text-2xl font-semibold">Profile</h1>

        {error ? (
          <p className="mt-4 text-sm text-red-300">
            {error}{" "}
            <Link href="/login" className="text-[var(--convene-hero)] underline">
              Sign in
            </Link>
          </p>
        ) : null}
        {ok ? <p className="mt-4 text-sm text-emerald-300">{ok}</p> : null}
        {formInner}
      </div>
    </div>
  );
}

/** Standalone `/profile` (dark) or dashboard embedded settings. Dashboard matches signup wizard + `PATCH /api/me`. */
export function ProfilePageBody({
  variant = "page",
  dashboardMode = "learner",
}: {
  variant?: "page" | "dashboard";
  /** When embedded in dashboard: learner "Profile settings" vs expert "Expert profile". */
  dashboardMode?: "learner" | "expert";
}) {
  if (variant === "dashboard") {
    return <ProfileDashboardSettings dashboardMode={dashboardMode} />;
  }
  return <ProfilePageSettingsForm />;
}

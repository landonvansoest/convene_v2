"use client";

import Link from "next/link";
import { Camera, Upload, UserRound, Wand2 } from "lucide-react";
import { FormEvent, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { DashboardViewHeader, dashboardViewCardClass } from "@/app/dashboard/DashboardViewShell";
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
import { cn } from "@/lib/utils";
import {
  bookingInformationBodyText,
  bookingTimezoneHintMaps,
  buildRegistrationProfilePatch,
  genders,
  isValidIanaTimeZone,
  isoDateToUsDisplay,
  LANGUAGE_NONE,
  languages,
  manualInputClass,
  manualSelectTriggerClass,
  manualTextareaClass,
  parseUsDateToIso,
  sectionBodyClass,
} from "@/lib/profile/registration-profile";
import {
  BioGeneratorDialog,
  ServicesGeneratorDialog,
  SkillsSuggestionDialog,
} from "@/components/expert/ExpertSlide4GeneratorDialogs";
import { experienceLevels } from "@/lib/expert-registration";

type Category = { category_id: string; name: string };

function parseQualificationsFromList(s: string): string[] {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function initials(firstName: string, lastName: string, email: string) {
  const a = firstName.trim().slice(0, 1);
  const b = lastName.trim().slice(0, 1);
  if (a || b) return `${a}${b}`.toUpperCase();
  return email.trim().slice(0, 1).toUpperCase() || "U";
}

type Profile = Record<string, unknown>;

export function ProfileDashboardSettings({ dashboardMode = "learner" }: { dashboardMode?: "learner" | "expert" }) {
  const mapsConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim());
  const uploadFileRef = useRef<HTMLInputElement | null>(null);
  const captureFileRef = useRef<HTMLInputElement | null>(null);
  const liveCameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveCameraStreamRef = useRef<MediaStream | null>(null);
  const hometownRef = useRef<HTMLInputElement | null>(null);
  const editorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);
  const persistedBookingPairRef = useRef<{ hometown: string; time_zone: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasExpertProfile, setHasExpertProfile] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [hometown, setHometown] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [bookingTzStepOk, setBookingTzStepOk] = useState(false);
  const [language, setLanguage] = useState("English");
  const [profession, setProfession] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [birthday, setBirthday] = useState("");
  const [birthdayFieldFocused, setBirthdayFieldFocused] = useState(false);
  const [birthdayDraft, setBirthdayDraft] = useState<string | null>(null);
  const [gender, setGender] = useState("");
  const [profilePhotoRemote, setProfilePhotoRemote] = useState<string | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [expertCategoryId, setExpertCategoryId] = useState("");
  const [expertCategorySuggestion, setExpertCategorySuggestion] = useState("");
  const [expertExperience, setExpertExperience] = useState("");
  const [expertQualItems, setExpertQualItems] = useState<string[]>([]);
  const [expertQualInput, setExpertQualInput] = useState("");
  const [expertAboutServices, setExpertAboutServices] = useState("");
  const [expertSkills, setExpertSkills] = useState<string[]>([]);
  const [expertSkillsInput, setExpertSkillsInput] = useState("");
  const [categorySuggestBusy, setCategorySuggestBusy] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [rawPhotoDataUrl, setRawPhotoDataUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  function onHometownFieldChange(value: string) {
    setHometown(value);
    if (mapsConfigured) setBookingTzStepOk(false);
  }

  function onTimeZoneFieldChange(value: string) {
    setTimeZone(value);
    setBookingTzStepOk(true);
  }

  function flushBirthdayDraft() {
    if (birthdayDraft === null) return;
    const raw = birthdayDraft.trim();
    setBirthdayDraft(null);
    setBirthdayFieldFocused(false);
    if (!raw) {
      setBirthday("");
      return;
    }
    const iso = parseUsDateToIso(raw);
    if (iso) setBirthday(iso);
  }

  function onBirthdayFocus() {
    setBirthdayFieldFocused(true);
    setBirthdayDraft((prev) => {
      if (prev !== null) return prev;
      if (birthday && /^\d{4}-\d{2}-\d{2}$/.test(birthday)) return isoDateToUsDisplay(birthday);
      return "";
    });
  }

  function onBirthdayBlur() {
    flushBirthdayDraft();
  }

  const birthdayInputValue =
    birthdayDraft !== null
      ? birthdayDraft
      : birthday && /^\d{4}-\d{2}-\d{2}$/.test(birthday)
        ? isoDateToUsDisplay(birthday)
        : "";

  const birthdayInputPlaceholder = birthdayFieldFocused ? "mm/dd/yyyy" : "Birthday (optional)";

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
      setUserId(String(data.user.id ?? ""));
      setEmail(String(data.user.email ?? ""));
      const p = data.profile as Profile | null;
      setProfile(p);
      const expert = Boolean(p?.has_expert_profile);
      setHasExpertProfile(expert);
      if (p) {
        setFirstName(String(p.first_name ?? ""));
        setLastName(String(p.last_name ?? ""));
        setPhoneNumber(String(p.phone_number ?? ""));
        const hz = String(p.hometown ?? "");
        const tz = String(p.time_zone ?? "");
        setHometown(hz);
        setTimeZone(tz);
        const persistedLang = p.language;
        setLanguage(
          persistedLang && String(persistedLang).trim() ? String(persistedLang) : LANGUAGE_NONE,
        );
        setProfession(String(p.profession ?? ""));
        let intro = String(p.introduction ?? "").trim();
        if (expert) {
          const [draftRes, catRes] = await Promise.all([
            fetch("/api/experts/registration-draft", { cache: "no-store" }),
            fetch("/api/categories", { cache: "no-store" }),
          ]);
          const catJson = (await catRes.json().catch(() => ({}))) as { categories?: Category[] };
          setCategories(Array.isArray(catJson.categories) ? catJson.categories : []);
          const dj = (await draftRes.json().catch(() => ({}))) as {
            profile?: Record<string, unknown> | null;
          };
          const prof = dj.profile;
          if (prof && typeof prof === "object") {
            const listingBio = String(prof.expert_bio ?? "").trim();
            intro = listingBio || intro;
            const cid = prof.category_id;
            setExpertCategoryId(cid != null && String(cid).trim() ? String(cid) : "");
            {
              const ex = String(prof.experience_level ?? "");
              setExpertExperience(
                experienceLevels.includes(ex as (typeof experienceLevels)[number]) ? ex : "",
              );
            }
            setExpertQualItems(parseQualificationsFromList(String(prof.qualifications ?? "")));
            setExpertAboutServices(String(prof.about_services ?? "").slice(0, 1000));
            const sk = prof.skills_specializations;
            setExpertSkills(
              Array.isArray(sk) ? sk.filter((x): x is string => typeof x === "string").slice(0, 30) : [],
            );
          }
        }
        setIntroduction(intro);
        setBirthday(p.birthday ? String(p.birthday).slice(0, 10) : "");
        setGender(String(p.gender ?? ""));
        const photoUrl = p.profile_photo ? String(p.profile_photo) : null;
        setProfilePhotoRemote(photoUrl);
        setProfilePhotoPreview(photoUrl);
        const hzLoaded = hz.trim();
        const tzLoaded = tz.trim();
        persistedBookingPairRef.current =
          hzLoaded && tzLoaded && isValidIanaTimeZone(tzLoaded)
            ? { hometown: hzLoaded, time_zone: tzLoaded }
            : null;
        setBookingTzStepOk(
          !mapsConfigured || (Boolean(hzLoaded) && Boolean(tzLoaded) && isValidIanaTimeZone(tzLoaded)),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    if ((window as unknown as { google?: { maps?: { places?: { Autocomplete?: unknown } } } }).google?.maps
      ?.places?.Autocomplete)
      return;

    const id = "google-maps-places-script";
    if (document.getElementById(id)) return;

    const script = document.createElement("script");
    script.id = id;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const g = (window as unknown as { google?: { maps?: { places?: { Autocomplete: new (el: HTMLInputElement, opts: object) => { addListener: (ev: string, fn: () => void) => void; getPlace: () => { formatted_address?: string; name?: string; geometry?: { location?: { lat: () => number; lng: () => number } } } } } } } }).google;
    if (!g?.maps?.places?.Autocomplete) return;

    const el = hometownRef.current;
    if (!el || (el as unknown as { __convenePlacesAttached?: boolean }).__convenePlacesAttached) return;
    (el as unknown as { __convenePlacesAttached?: boolean }).__convenePlacesAttached = true;
    const ac = new g.maps.places.Autocomplete(el, {
      types: ["(cities)"],
      fields: ["formatted_address", "name", "geometry"],
    });
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      const label = place.formatted_address || place.name || "";
      if (label) {
        setHometown(label);
        if (mapsConfigured) setBookingTzStepOk(false);
      }
      const loc = place.geometry?.location;
      if (!loc) return;
      const lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
      const lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!key) return;
      void (async () => {
        const ts = Math.floor(Date.now() / 1000);
        const r = await fetch(
          `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${ts}&key=${key}`,
        );
        const j = (await r.json()) as { status?: string; timeZoneId?: string };
        if (j.status === "OK" && j.timeZoneId) {
          setTimeZone(j.timeZoneId);
          setBookingTzStepOk(true);
        }
      })();
    });
  });

  useEffect(() => {
    if (!editorOpen || !rawPhotoDataUrl || !editorCanvasRef.current) return;
    const canvas = editorCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      const size = canvas.width;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.save();
      ctx.translate(size / 2 + offsetX, size / 2 + offsetY);
      ctx.rotate((rotation * Math.PI) / 180);
      const scale = Math.max(size / img.width, size / img.height) * zoom;
      ctx.scale(scale, scale);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    };
    img.src = rawPhotoDataUrl;
  }, [editorOpen, rawPhotoDataUrl, zoom, rotation, offsetX, offsetY]);

  useEffect(() => {
    if (!cameraOpen) return;
    const video = liveCameraVideoRef.current;
    if (!video) return;
    video.srcObject = liveCameraStreamRef.current;
    void video.play().catch(() => {});
  }, [cameraOpen]);

  useEffect(() => {
    return () => {
      stopLiveCamera();
    };
  }, []);

  function onPickFile(file: File | null | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = typeof reader.result === "string" ? reader.result : null;
      if (!data) return;
      setRawPhotoDataUrl(data);
      setZoom(1);
      setRotation(0);
      setOffsetX(0);
      setOffsetY(0);
      setEditorOpen(true);
    };
    reader.readAsDataURL(file);
  }

  function stopLiveCamera() {
    const stream = liveCameraStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      liveCameraStreamRef.current = null;
    }
    const video = liveCameraVideoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    setCameraOpen(false);
  }

  async function openLiveCamera() {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      captureFileRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      liveCameraStreamRef.current = stream;
      setCameraOpen(true);
    } catch {
      captureFileRef.current?.click();
    }
  }

  function captureFromLiveCamera() {
    const video = liveCameraVideoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) return;
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onPickFile(new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
    stopLiveCamera();
  }

  function beginEditorDrag(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    editorDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: offsetX,
      baseY: offsetY,
    };
  }

  function moveEditorDrag(e: ReactPointerEvent<HTMLCanvasElement>) {
    const d = editorDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const nextX = d.baseX + (e.clientX - d.startX);
    const nextY = d.baseY + (e.clientY - d.startY);
    setOffsetX(Math.max(-220, Math.min(220, nextX)));
    setOffsetY(Math.max(-220, Math.min(220, nextY)));
  }

  function endEditorDrag(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (editorDragRef.current?.pointerId !== e.pointerId) return;
    editorDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // no-op
    }
  }

  async function uploadEditedPhoto() {
    if (!editorCanvasRef.current) return;
    setBusyPhoto(true);
    setError(null);
    try {
      const dataUrl = editorCanvasRef.current.toDataURL("image/jpeg", 0.9);
      const imgRes = await fetch(dataUrl);
      const blob = await imgRes.blob();
      const fd = new FormData();
      fd.append("file", new File([blob], `profile-${Date.now()}.jpg`, { type: "image/jpeg" }));
      const r = await fetch("/api/me/profile-photo", { method: "POST", body: fd });
      const j = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error ?? "Upload failed");
      setProfilePhotoRemote(j.url);
      setProfilePhotoPreview(j.url);
      setEditorOpen(false);
      setRawPhotoDataUrl(null);
      setOk("Photo updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload photo.");
    } finally {
      setBusyPhoto(false);
    }
  }

  function assertBookingStepReady() {
    if (!hometown.trim()) {
      throw new Error("Hometown is required.");
    }
    const tz = timeZone.trim();
    const mapsPickMessage =
      "Pick your hometown from the suggestions so convene can set your time zone from your city.";
    if (mapsConfigured) {
      if (!tz || !isValidIanaTimeZone(tz)) {
        throw new Error(mapsPickMessage);
      }
      const persisted = persistedBookingPairRef.current;
      const matchesPersisted =
        persisted && persisted.hometown === hometown.trim() && persisted.time_zone === tz;
      if (!matchesPersisted && !bookingTzStepOk) {
        throw new Error(mapsPickMessage);
      }
    } else if (!tz || !isValidIanaTimeZone(tz)) {
      throw new Error("Enter a valid IANA time zone (e.g. America/New_York).");
    }
  }

  function addExpertQualItem() {
    const q = expertQualInput.trim();
    if (!q) return;
    setExpertQualItems((prev) => (prev.includes(q) ? prev : [...prev, q].slice(0, 10)));
    setExpertQualInput("");
  }

  function removeExpertQualItem(i: number) {
    setExpertQualItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addExpertSkill() {
    const s = expertSkillsInput.trim();
    if (!s) return;
    setExpertSkills((prev) => (prev.includes(s) ? prev : [...prev, s].slice(0, 30)));
    setExpertSkillsInput("");
  }

  function removeExpertSkill(i: number) {
    setExpertSkills((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function sendExpertCategorySuggestion() {
    const suggestion = expertCategorySuggestion.trim();
    if (!suggestion) return;
    setCategorySuggestBusy(true);
    try {
      const res = await fetch("/api/user-feedback/expert-category-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion, context: { route: "expert-dashboard-profile" } }),
      });
      if (res.ok) setExpertCategorySuggestion("");
    } finally {
      setCategorySuggestBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    flushBirthdayDraft();
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      if (!firstName.trim() || !lastName.trim()) {
        throw new Error("First name and last name are required.");
      }
      assertBookingStepReady();
      const patch = buildRegistrationProfilePatch({
        firstName,
        lastName,
        phoneNumber,
        hometown,
        timeZone,
        language,
        profession,
        introduction,
        birthday,
        gender,
        profilePhotoUrl: profilePhotoRemote,
      });
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : typeof data.error === "object"
              ? JSON.stringify(data.error)
              : "Save failed";
        throw new Error(msg);
      }
      setProfile(data.profile as Profile);
      const p = data.profile as Profile | null;
      if (p) {
        const hz = String(p.hometown ?? "").trim();
        const tz = String(p.time_zone ?? "").trim();
        persistedBookingPairRef.current =
          hz && tz && isValidIanaTimeZone(tz) ? { hometown: hz, time_zone: tz } : null;
        setBookingTzStepOk(
          !mapsConfigured || (Boolean(hz) && Boolean(tz) && isValidIanaTimeZone(tz)),
        );
      }
      if (Boolean(data.profile?.has_expert_profile)) {
        const bio = introduction.trim();
        const expLevel =
          expertExperience && experienceLevels.includes(expertExperience as (typeof experienceLevels)[number])
            ? expertExperience
            : null;
        const draftBody: Record<string, unknown> = {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone_number: phoneNumber.trim() || null,
          hometown: hometown.trim() || null,
          time_zone: timeZone.trim() || null,
          profession: profession.trim() || null,
          profile_photo: profilePhotoRemote,
          language: !language.trim() || language === LANGUAGE_NONE ? null : language.trim(),
          introduction: bio || null,
          expert_bio: bio ? bio.slice(0, 1000) : null,
          birthday: birthday.trim() === "" ? null : birthday.trim(),
          gender: gender.trim() || null,
          category_id:
            !expertCategoryId || expertCategoryId === "__other__" ? null : expertCategoryId,
          experience_level: expLevel,
          qualifications: expertQualItems.join("\n"),
          about_services: expertAboutServices.slice(0, 1000),
          skills_specializations: expertSkills.filter(Boolean).slice(0, 30),
        };
        const draftRes = await fetch("/api/experts/registration-draft", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftBody),
        });
        if (!draftRes.ok) {
          const dj = await draftRes.json().catch(() => ({}));
          const msg =
            typeof dj.error === "string"
              ? dj.error
              : dj.error && typeof dj.error === "object"
                ? JSON.stringify(dj.error)
                : "Expert listing sync failed";
          throw new Error(msg);
        }
      }
      setOk("Saved.");
    } catch (errUnknown) {
      setError(errUnknown instanceof Error ? errUnknown.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={dashboardViewCardClass}>
        <p className="text-sm font-medium text-[#003049]/60">Loading…</p>
      </div>
    );
  }

  const isExpertDashboard = dashboardMode === "expert";

  return (
    <div className={dashboardViewCardClass}>
      <DashboardViewHeader
        Icon={UserRound}
        title={isExpertDashboard ? "Expert Profile" : "Profile Settings"}
        subtitle={
          isExpertDashboard ? (
            <>
              <p>
                Update your professional information and public profile. Click &quot;Update Profile&quot; below to save
                changes.
              </p>
              {userId ? (
                <Link
                  href={`/experts/${encodeURIComponent(userId)}`}
                  className="mt-2 inline-flex text-sm font-semibold text-[#F77F00] underline underline-offset-2 hover:text-[#003049]"
                >
                  View Public Profile
                </Link>
              ) : null}
            </>
          ) : userId ? (
            <Link
              href={`/learner/${encodeURIComponent(userId)}`}
              className="inline-flex text-sm font-semibold text-[#F77F00] underline underline-offset-2 hover:text-[#003049]"
            >
              View your profile
            </Link>
          ) : undefined
        }
      />
      {error ? (
        <p className="mt-4 text-sm text-destructive">
          {error}{" "}
          <Link href="/login" className="font-medium text-[#F77F00] underline">
            Sign in
          </Link>
        </p>
      ) : null}
      {ok ? <p className="mt-4 text-sm font-medium text-emerald-700">{ok}</p> : null}

      {profile ? (
        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-6">
          <section className="rounded-xl border border-[#003049]/10 bg-white p-4 sm:p-5">
            <h2 className="text-lg font-bold text-[#003049] sm:text-xl">Profile Photo</h2>
            <p className={sectionBodyClass}>Add a photo for a more personal connection with experts.</p>
            <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-center">
              <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-[#FFF6EE] text-3xl font-semibold text-[#003049] sm:h-36 sm:w-36 sm:text-4xl">
                {profilePhotoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profilePhotoPreview}
                    alt=""
                    className="h-32 w-32 rounded-full object-cover sm:h-36 sm:w-36"
                  />
                ) : (
                  initials(firstName, lastName, email)
                )}
              </div>
              <div className="mx-auto flex w-full max-w-[13.5rem] flex-col space-y-3 md:mx-0">
                <input
                  ref={uploadFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0])}
                />
                <input
                  ref={captureFileRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full rounded-xl border-2 border-[#003049] text-sm font-semibold text-[#003049]"
                  onClick={() => uploadFileRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full rounded-xl border-2 border-[#003049] text-sm font-semibold text-[#003049]"
                  onClick={() => void openLiveCamera()}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Take a Photo
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[#003049]/10 bg-white p-4 sm:p-5">
            <h2 className="text-lg font-bold text-[#003049] sm:text-xl">Contact Information</h2>
            <p className={sectionBodyClass}>
              Share your preferred way to receive notifications about upcoming bookings and incoming messages. convene
              will never share your personal information.
            </p>
            <div className="mt-4 grid gap-3">
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First Name"
                className={manualInputClass}
              />
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last Name"
                className={manualInputClass}
              />
              <Input value={email} readOnly placeholder="Email" className={manualInputClass} />
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Phone Number (for sms reminders)"
                className={manualInputClass}
              />
            </div>
          </section>

          <section className="rounded-xl border border-[#003049]/10 bg-white p-4 sm:p-5">
            <h2 className="text-lg font-bold text-[#003049] sm:text-xl">Personal Details</h2>
            <p className={sectionBodyClass}>{bookingInformationBodyText}</p>
            <div className="mt-4 grid gap-3">
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Hometown</Label>
                <Input
                  ref={hometownRef}
                  value={hometown}
                  onChange={(e) => onHometownFieldChange(e.target.value)}
                  placeholder="Hometown (required)"
                  className={manualInputClass}
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Timezone</Label>
                <Input
                  value={timeZone}
                  readOnly={mapsConfigured}
                  onChange={mapsConfigured ? undefined : (e) => onTimeZoneFieldChange(e.target.value)}
                  placeholder={mapsConfigured ? "Set automatically from hometown" : "Time zone (required)"}
                  className={cn(manualInputClass, mapsConfigured && "cursor-default bg-[#F8FAFC]")}
                />
                <p className="mt-1.5 text-xs leading-relaxed text-[#003049]/70">
                  {mapsConfigured ? bookingTimezoneHintMaps : "Enter a valid IANA time zone (e.g. America/New_York)."}
                </p>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Preferred Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className={manualSelectTriggerClass}>
                    <SelectValue placeholder="No preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={LANGUAGE_NONE}>No preference</SelectItem>
                    {languages.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Birthday</Label>
                <Input
                  type="text"
                  autoComplete="bday"
                  value={birthdayInputValue}
                  onChange={(e) => {
                    setBirthdayFieldFocused(true);
                    setBirthdayDraft(e.target.value);
                  }}
                  onFocus={onBirthdayFocus}
                  onBlur={onBirthdayBlur}
                  placeholder={birthdayInputPlaceholder}
                  className={manualInputClass}
                  aria-label="Birthday (optional)"
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger className={manualSelectTriggerClass}>
                    <SelectValue placeholder="Gender (optional)" />
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
            </div>
          </section>

          <section className="rounded-xl border border-[#003049]/10 bg-white p-4 sm:p-5">
            <h2 className="text-lg font-bold text-[#003049] sm:text-xl">Professional Details</h2>
            <p className={sectionBodyClass}>
              {hasExpertProfile
                ? "Include all details as you'd like them to appear on your public Expert Profile Page."
                : "Almost there! Add some information to introduce yourself to Experts."}
            </p>
            {hasExpertProfile ? (
              <p className={cn(sectionBodyClass, "mt-2")}>
                Use our generator tool anywhere you see a{" "}
                <Wand2
                  className="inline-block h-3.5 w-3.5 align-[-0.15em] text-[#F77F00]"
                  strokeWidth={2}
                  aria-hidden
                />{" "}
                for some extra help getting started.
              </p>
            ) : null}
            <div className="mt-4 grid gap-3">
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Professional Title</Label>
                <Input
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                  placeholder="Profession"
                  className={manualInputClass}
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Professional Bio</Label>
                <Textarea
                  rows={4}
                  maxLength={hasExpertProfile ? 1000 : 8000}
                  value={introduction}
                  onChange={(e) =>
                    setIntroduction(
                      hasExpertProfile ? e.target.value.slice(0, 1000) : e.target.value.slice(0, 8000),
                    )
                  }
                  placeholder={
                    hasExpertProfile
                      ? "Professional bio for your expert listing (syncs with registration wizard and manual form)."
                      : "Tell us about yourself, your interests, passions, and what you're looking to learn."
                  }
                  className={manualTextareaClass}
                />
                {hasExpertProfile ? (
                  <p className="mt-1 text-[11px] text-[#003049]/60">{introduction.length}/1000</p>
                ) : null}
                {hasExpertProfile ? (
                  <BioGeneratorDialog
                    profession={profession}
                    qualificationItems={expertQualItems}
                    manualInputClass={manualInputClass}
                    onBioGenerated={(bio) => setIntroduction(bio.slice(0, 1000))}
                  />
                ) : null}
              </div>
              {hasExpertProfile ? (
                <>
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Category</Label>
                  <Select
                    value={expertCategoryId || "__none__"}
                    onValueChange={(v) => setExpertCategoryId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className={manualSelectTriggerClass}>
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select category</SelectItem>
                      <SelectItem value="__other__">Other</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.category_id} value={c.category_id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {expertCategoryId === "__other__" ? (
                  <div className="space-y-2 rounded-xl border border-[#003049]/15 bg-[#F8FAFC] p-4">
                    <p className="text-xs font-medium text-[#003049]/85">
                      Suggest a category—we review suggestions from registration and the dashboard alike.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={expertCategorySuggestion}
                        onChange={(e) => setExpertCategorySuggestion(e.target.value)}
                        placeholder="Describe your category or specialization"
                        className={manualInputClass}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 shrink-0 rounded-lg border-2 border-[#003049] text-sm font-semibold text-[#003049]"
                        disabled={categorySuggestBusy}
                        onClick={() => void sendExpertCategorySuggestion()}
                      >
                        {categorySuggestBusy ? "Sending…" : "Send suggestion"}
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Experience level</Label>
                  <Select
                    value={expertExperience || "__none__"}
                    onValueChange={(v) => setExpertExperience(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className={manualSelectTriggerClass}>
                      <SelectValue placeholder="Experience level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select experience</SelectItem>
                      {experienceLevels.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Qualifications</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Click + to add qualifications."
                      value={expertQualInput}
                      onChange={(e) => setExpertQualInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addExpertQualItem();
                        }
                      }}
                      className={manualInputClass}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 shrink-0 rounded-lg border-2 border-[#003049] px-3 font-bold text-[#003049]"
                      onClick={addExpertQualItem}
                    >
                      +
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {expertQualItems.map((q, i) => (
                      <button
                        key={`${q}-${i}`}
                        type="button"
                        onClick={() => removeExpertQualItem(i)}
                        className="rounded-full border border-[#003049]/20 bg-[#FFF6EE] px-2.5 py-1 text-xs font-medium text-[#003049] hover:bg-[#FFF6EE]/80"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">About your services</Label>
                  <Textarea
                    rows={4}
                    maxLength={1000}
                    value={expertAboutServices}
                    onChange={(e) => setExpertAboutServices(e.target.value.slice(0, 1000))}
                    placeholder="About Your Services (describe how you can help learners on convene)"
                    className={manualTextareaClass}
                  />
                  <p className="mt-1 text-[11px] text-[#003049]/60">{expertAboutServices.length}/1000</p>
                  <ServicesGeneratorDialog
                    manualInputClass={manualInputClass}
                    onServicesGenerated={(text) => setExpertAboutServices(text.slice(0, 1000))}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Skills and specializations</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Click + to add skills"
                      value={expertSkillsInput}
                      onChange={(e) => setExpertSkillsInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addExpertSkill();
                        }
                      }}
                      className={manualInputClass}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 shrink-0 rounded-lg border-2 border-[#003049] px-3 font-bold text-[#003049]"
                      onClick={addExpertSkill}
                    >
                      +
                    </Button>
                  </div>
                  <SkillsSuggestionDialog
                    profession={profession}
                    expertBio={introduction}
                    qualificationItems={expertQualItems}
                    existingSkills={expertSkills}
                    onSkillsAdd={(skills) => {
                      setExpertSkills((prev) => [...prev, ...skills.filter((s) => !prev.includes(s))].slice(0, 30));
                    }}
                  />
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {expertSkills.map((s, i) => (
                      <button
                        key={`${s}-${i}`}
                        type="button"
                        onClick={() => removeExpertSkill(i)}
                        className="rounded-full bg-[#003049] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#003049]/90"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                </>
                ) : null}
            </div>
          </section>

          <Button
            type="submit"
            disabled={saving}
            className="h-11 w-full rounded-lg bg-[#F77F00] text-sm font-bold text-white sm:h-12 sm:text-base"
          >
            {saving ? "Saving…" : isExpertDashboard ? "Update Profile" : "Save profile"}
          </Button>
        </form>
      ) : null}

      {cameraOpen ? (
        <div className="fixed inset-0 z-[59] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-[#003049] sm:text-lg">Take a profile photo</h3>
              <button
                type="button"
                onClick={stopLiveCamera}
                className="rounded border px-2 py-1 text-xs sm:text-sm"
              >
                Close
              </button>
            </div>
            <div className="mx-auto flex w-full justify-center">
              <video
                ref={liveCameraVideoRef}
                autoPlay
                playsInline
                muted
                className="h-64 w-64 rounded-full border object-cover"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" className="h-9 text-sm" onClick={stopLiveCamera}>
                Cancel
              </Button>
              <Button className="h-9 text-sm" onClick={captureFromLiveCamera}>
                Take photo
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {editorOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-[#003049] sm:text-lg">Edit profile photo</h3>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded border px-2 py-1 text-xs sm:text-sm"
              >
                Close
              </button>
            </div>
            <div className="mx-auto flex w-full justify-center">
              <canvas
                ref={editorCanvasRef}
                width={512}
                height={512}
                className="h-64 w-64 touch-none cursor-grab rounded-full border object-cover active:cursor-grabbing"
                onPointerDown={beginEditorDrag}
                onPointerMove={moveEditorDrag}
                onPointerUp={endEditorDrag}
                onPointerCancel={endEditorDrag}
              />
            </div>
            <div className="mt-4 grid gap-2">
              <Label className="text-xs font-medium">Zoom</Label>
              <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
              <Label className="text-xs font-medium">Rotate</Label>
              <input type="range" min="-180" max="180" step="1" value={rotation} onChange={(e) => setRotation(Number(e.target.value))} />
              <p className="pt-1 text-xs font-medium text-[#003049]/70">Tip: click and drag the photo to reframe.</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" className="h-9 text-sm" onClick={() => setEditorOpen(false)}>
                Cancel
              </Button>
              <Button className="h-9 text-sm" disabled={busyPhoto} onClick={() => void uploadEditedPhoto()}>
                {busyPhoto ? "Uploading…" : "Use photo"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

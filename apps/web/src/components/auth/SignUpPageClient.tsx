"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  MapPin,
  Phone,
  Sparkles,
  Upload,
  UserRoundPen,
  X,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  isoDateToUsDisplay,
  maskUsDateDigitsFromInput,
  parseUsDateToIso,
} from "@/lib/profile/registration-profile";
import { isLearnerRegistrationComplete, LEARNER_REGISTRATION_WIZARD_PATH } from "@/lib/auth/learner-registration";
import { verifyFailedDescription, stripVerifyFailedSearchParams } from "@/lib/auth/verify-failed-message";
import { SignInDialog } from "@/components/auth/SignInDialog";

const languages = ["English", "Spanish", "French", "German", "Mandarin", "Arabic", "Hindi", "Portuguese", "Japanese"];
/** Select value for optional language (sent as `null` in API patch). */
const LANGUAGE_NONE = "__none__";
const genders = ["Male", "Female", "Non-binary", "Prefer not to say"];

type HometownInputElement = HTMLInputElement & { __convenePlacesAttached?: boolean };

type GoogleAutocompleteInstance = {
  addListener: (event: string, cb: () => void) => void;
  getPlace: () => {
    formatted_address?: string;
    name?: string;
    geometry?: { location?: { lat: unknown; lng: unknown } };
  };
};

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      places?: {
        Autocomplete?: new (
          input: HTMLInputElement,
          opts: { types: string[]; fields: string[] },
        ) => GoogleAutocompleteInstance;
      };
    };
  };
};

function getGoogleMapsWindow(): GoogleMapsWindow {
  return window as GoogleMapsWindow;
}

function isValidIanaTimeZone(tz: string): boolean {
  const t = tz.trim();
  if (!t) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: t });
    return true;
  } catch {
    return false;
  }
}

/** v1-scale fields: ~13px, compact height, regular weight. */
const manualInputClass =
  "h-9 text-[13px] leading-snug font-normal text-[#003049] placeholder:text-[#003049]";
const manualTextareaClass =
  "min-h-[88px] text-[13px] leading-snug font-normal text-[#003049] placeholder:text-[#003049]";
const manualSelectTriggerClass =
  "h-9 text-[13px] leading-snug font-normal text-[#003049] px-2.5 [&_span[data-placeholder]]:text-[#003049]";

/** Section lead copy: slightly larger + medium weight (v1-style body under headings). */
const sectionBodyClass =
  "mt-1.5 text-[13px] font-medium leading-snug text-[#003049]/90 sm:text-sm";

const wizardSectionBodyClass =
  "mt-3 text-[13px] font-medium leading-relaxed text-[#003049]/90 sm:mt-3.5 sm:text-sm";

const bookingInformationBodyText =
  "convene will calculate your time zone based on your hometown. Note that all booking information will be displayed in your hometown's time zone.";

const bookingTimezoneHintMaps = "Time zone auto-detected based on your hometown.";

function WizardSectionHeading({ Icon, children }: { Icon: LucideIcon; children: ReactNode }) {
  return (
    <h3 className="flex items-start gap-2.5 text-lg font-bold text-[#003049] sm:gap-3 sm:text-xl">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#F77F00] sm:h-6 sm:w-6" strokeWidth={2} aria-hidden />
      <span>{children}</span>
    </h3>
  );
}

type ProfilePatch = {
  first_name?: string;
  last_name?: string;
  phone_number?: string | null;
  hometown?: string | null;
  time_zone?: string | null;
  language?: string | null;
  profession?: string | null;
  introduction?: string | null;
  birthday?: string | null;
  gender?: string | null;
  profile_photo?: string | null;
  convene_role_mode?: "learner" | "expert";
  complete_learner_registration?: true;
};

function initials(firstName: string, lastName: string, email: string) {
  const a = firstName.trim().slice(0, 1);
  const b = lastName.trim().slice(0, 1);
  if (a || b) return `${a}${b}`.toUpperCase();
  return email.trim().slice(0, 1).toUpperCase() || "U";
}

export function SignUpPageClient() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const mapsConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim());
  const uploadFileRef = useRef<HTMLInputElement | null>(null);
  const captureFileRef = useRef<HTMLInputElement | null>(null);
  const liveCameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveCameraStreamRef = useRef<MediaStream | null>(null);
  const hometownManualRef = useRef<HTMLInputElement | null>(null);
  const hometownWizardRef = useRef<HTMLInputElement | null>(null);
  /** Last hometown + time_zone loaded from (or saved to) the server — used to allow continue if Maps clears the “place picked” flag but values are unchanged. */
  const persistedBookingPairRef = useRef<{ hometown: string; time_zone: string } | null>(null);
  const editorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** After profile load for a signed-in user — used to gate draft autosave. */
  const [registrationSessionReady, setRegistrationSessionReady] = useState(false);
  const [draftAutosaveReady, setDraftAutosaveReady] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [wizardOpen, setWizardOpen] = useState(true);
  const [wizardStep, setWizardStep] = useState(1); // 1 intro, 2..6 flow (success overlay on /dashboard)
  /** True when the page needs a session before the wizard can load (e.g. after email-link PKCE mismatch). */
  const [awaitingSignIn, setAwaitingSignIn] = useState(false);
  const [signInPromptDescription, setSignInPromptDescription] = useState<string | null>(null);
  const [signInDialogOpen, setSignInDialogOpen] = useState(false);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [hometown, setHometown] = useState("");
  const [timeZone, setTimeZone] = useState("UTC");
  /** With Maps: true after Google place→timezone success. Without Maps: true after profile load or manual TZ edit. */
  const [bookingTzStepOk, setBookingTzStepOk] = useState(false);
  const [language, setLanguage] = useState("English");
  const [profession, setProfession] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [birthday, setBirthday] = useState("");
  const [birthdayFieldFocused, setBirthdayFieldFocused] = useState(false);
  /** While focused, raw `m/d/yyyy` text; `null` when blurred (committed to `birthday` as ISO). */
  const [birthdayDraft, setBirthdayDraft] = useState<string | null>(null);
  const [gender, setGender] = useState("");
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const [profilePhotoRemote, setProfilePhotoRemote] = useState<string | null>(null);
  const [rawPhotoDataUrl, setRawPhotoDataUrl] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  const bootstrapRegistration = useCallback(async () => {
    setLoading(true);
    setRegistrationSessionReady(false);
    setError(null);

    async function resolveAuthedUser() {
      const u = await supabase.auth.getUser();
      if (u.data.user) return u.data.user;

      const s = await supabase.auth.getSession();
      if (s.data.session?.user) return s.data.session.user;

      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const retry = await supabase.auth.getUser();
        if (retry.data.user) return retry.data.user;
        const s2 = await supabase.auth.getSession();
        if (s2.data.session?.user) return s2.data.session.user;
      }
      return null;
    }

    const user = await resolveAuthedUser();

    if (!user) {
      setAwaitingSignIn(true);
      setSignInDialogOpen(true);
      setWizardOpen(false);
      setLoading(false);
      return;
    }

    setAwaitingSignIn(false);
    setSignInDialogOpen(false);

    const me = await fetch("/api/me", { cache: "no-store" });
    const body = await me.json().catch(() => null);
    const profile = body?.profile as Record<string, unknown> | null;
    const meUser = body?.user as { email?: string } | null;

    if (isLearnerRegistrationComplete(profile)) {
      router.replace("/dashboard");
      return;
    }

    setEmail(String(meUser?.email ?? user.email ?? ""));
    setFirstName(String(profile?.first_name ?? user.user_metadata?.first_name ?? ""));
    setLastName(String(profile?.last_name ?? user.user_metadata?.last_name ?? ""));
    setPhoneNumber(String(profile?.phone_number ?? ""));
    setHometown(String(profile?.hometown ?? ""));
    setTimeZone(String(profile?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"));
    const persistedLang = profile?.language;
    setLanguage(
      persistedLang && String(persistedLang).trim() ? String(persistedLang) : "English",
    );
    const hzLoaded = String(profile?.hometown ?? "").trim();
    const tzLoaded = String(profile?.time_zone ?? "").trim();
    persistedBookingPairRef.current =
      hzLoaded && tzLoaded && isValidIanaTimeZone(tzLoaded)
        ? { hometown: hzLoaded, time_zone: tzLoaded }
        : null;
    setBookingTzStepOk(
      !mapsConfigured || (Boolean(hzLoaded) && Boolean(tzLoaded) && isValidIanaTimeZone(tzLoaded)),
    );
    setProfession(String(profile?.profession ?? ""));
    setIntroduction(String(profile?.introduction ?? ""));
    setBirthday(String(profile?.birthday ?? ""));
    setGender(String(profile?.gender ?? ""));
    const photoUrl = profile?.profile_photo ? String(profile.profile_photo) : null;
    setProfilePhotoRemote(photoUrl);
    setProfilePhotoPreview(photoUrl);

    setWizardOpen(true);
    setRegistrationSessionReady(true);
    setLoading(false);
  }, [mapsConfigured, router, supabase]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("auth") === "verify_failed") {
        setSignInPromptDescription(verifyFailedDescription(params.get("reason")));
        setAwaitingSignIn(true);
        setSignInDialogOpen(true);
        const cleaned = new URL(window.location.href);
        stripVerifyFailedSearchParams(cleaned);
        window.history.replaceState({}, "", cleaned.toString());
      }
    }

    void bootstrapRegistration();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user) {
        void bootstrapRegistration();
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [bootstrapRegistration, supabase]);

  /** Defer autosave until after hydration paint so we don’t fight initial state sync. */
  useEffect(() => {
    if (loading) {
      setDraftAutosaveReady(false);
      return;
    }
    const id = window.setTimeout(() => setDraftAutosaveReady(true), 50);
    return () => clearTimeout(id);
  }, [loading]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    if (getGoogleMapsWindow().google?.maps?.places?.Autocomplete) return;

    const id = "google-maps-places-script";
    if (document.getElementById(id)) return;

    const script = document.createElement("script");
    script.id = id;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const g = getGoogleMapsWindow().google;
    const AutocompleteCtor = g?.maps?.places?.Autocomplete;
    if (!AutocompleteCtor) return;

    const attach = (el: HTMLInputElement | null) => {
      const marked = el as HometownInputElement;
      if (!marked || marked.__convenePlacesAttached) return;
      marked.__convenePlacesAttached = true;
      const ac = new AutocompleteCtor(marked, {
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
    };

    attach(hometownManualRef.current);
    attach(hometownWizardRef.current);
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

  async function patchProfile(patch: ProfilePatch) {
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      const msg = typeof j?.error === "string" ? j.error : "Profile save failed";
      throw new Error(msg);
    }
  }

  /**
   * Single source of truth for wizard + manual: maps UI state → `PATCH /api/me` body
   * (except `convene_role_mode`, only on final completion). Invalid partial birthday is omitted so the API is not rejected mid-typing.
   */
  function buildDraftRegistrationPatch(): ProfilePatch {
    const patch: ProfilePatch = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone_number: phoneNumber.trim() || null,
      hometown: hometown.trim() || null,
      time_zone: timeZone.trim() || null,
      language: !language.trim() || language === LANGUAGE_NONE ? null : language.trim(),
      profession: profession.trim() || null,
      introduction: introduction.trim() || null,
      gender: gender.trim() ? gender.trim() : null,
      profile_photo: profilePhotoRemote ?? null,
    };
    const bd = birthday.trim();
    if (bd === "") {
      patch.birthday = null;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(bd)) {
      patch.birthday = bd;
    }
    return patch;
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
        persisted &&
        persisted.hometown === hometown.trim() &&
        persisted.time_zone === tz;
      if (!matchesPersisted && !bookingTzStepOk) {
        throw new Error(mapsPickMessage);
      }
    } else if (!tz || !isValidIanaTimeZone(tz)) {
      throw new Error("Enter a valid IANA time zone (e.g. America/New_York).");
    }
  }

  function assertRegistrationCompleteForSubmit() {
    if (!firstName.trim() || !lastName.trim()) {
      throw new Error("First name and last name are required.");
    }
    if (!email.trim()) {
      throw new Error("Email is required.");
    }
    assertBookingStepReady();
  }

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
    setBusy(true);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload photo.");
    } finally {
      setBusy(false);
    }
  }

  async function saveStep(step: number) {
    if (step === 2) {
      await patchProfile(buildDraftRegistrationPatch());
      return;
    }
    if (step === 3) {
      if (!firstName.trim() || !lastName.trim()) {
        throw new Error("First name and last name are required.");
      }
      if (!email.trim()) {
        throw new Error("Email is required.");
      }
      await patchProfile(buildDraftRegistrationPatch());
      return;
    }
    if (step === 4) {
      assertBookingStepReady();
      await patchProfile(buildDraftRegistrationPatch());
      persistedBookingPairRef.current = {
        hometown: hometown.trim(),
        time_zone: timeZone.trim(),
      };
      return;
    }
    if (step === 5) {
      await patchProfile(buildDraftRegistrationPatch());
      return;
    }
    if (step === 6) {
      assertRegistrationCompleteForSubmit();
      await patchProfile({
        ...buildDraftRegistrationPatch(),
        convene_role_mode: "learner",
        complete_learner_registration: true,
      });
      persistedBookingPairRef.current = {
        hometown: hometown.trim(),
        time_zone: timeZone.trim(),
      };
    }
  }

  /** Debounced draft save: wizard + manual share state; latest PATCH wins. */
  useEffect(() => {
    if (!registrationSessionReady || !draftAutosaveReady) return;

    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        const patch = buildDraftRegistrationPatch();
        if (Object.keys(patch).length === 0) return;
        setDraftSaveStatus("saving");
        try {
          await patchProfile(patch);
          if (!cancelled) {
            setDraftSaveStatus("saved");
            window.setTimeout(() => {
              if (!cancelled) setDraftSaveStatus((s) => (s === "saved" ? "idle" : s));
            }, 2000);
          }
        } catch (e) {
          if (!cancelled) {
            setDraftSaveStatus("error");
            if (process.env.NODE_ENV === "development") {
              console.warn("[registration autosave]", e);
            }
          }
        }
      })();
    }, 550);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // buildDraftRegistrationPatch reads latest field state inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: save latest wizard fields on debounce
  }, [
    registrationSessionReady,
    draftAutosaveReady,
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
    profilePhotoRemote,
  ]);

  /** Warm the dashboard RSC + JS chunk before the user taps “Complete” (step 5–6). */
  useEffect(() => {
    if (loading || !wizardOpen) return;
    if (wizardStep >= 5) {
      void router.prefetch("/dashboard?registrationComplete=1");
      void router.prefetch("/dashboard");
    }
  }, [loading, router, wizardOpen, wizardStep]);

  async function continueWizard() {
    setError(null);
    flushBirthdayDraft();
    if (wizardStep === 1) {
      setWizardStep(2);
      return;
    }
    if (wizardStep > 6) return;
    setBusy(true);
    let leavingToDashboard = false;
    try {
      await saveStep(wizardStep);
      if (wizardStep === 6) {
        // Navigate first; do not close the wizard here. Closing early left users on
        // `/auth/callback/signup` with no chrome while `loadDashboardBootstrap()` ran.
        // `app/dashboard/loading.tsx` shows the skeleton while the new segment loads.
        router.replace("/dashboard?registrationComplete=1");
        leavingToDashboard = true;
      } else {
        setWizardStep((s) => s + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this step.");
    } finally {
      if (!leavingToDashboard) setBusy(false);
    }
  }

  /** Slide 2: optional photo — save draft and advance without requiring upload. */
  async function skipWizardPhotoStep() {
    if (wizardStep !== 2) return;
    setError(null);
    setBusy(true);
    try {
      await saveStep(2);
      setWizardStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not continue.");
    } finally {
      setBusy(false);
    }
  }

  async function submitManual() {
    flushBirthdayDraft();
    setBusy(true);
    setError(null);
    let navigated = false;
    try {
      await saveStep(6);
      router.push("/dashboard");
      navigated = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      if (!navigated) setBusy(false);
    }
  }

  /** Five wizard screens before review: photo → contact → booking → personal → review (review = 100%, not a 6th increment). */
  const WIZARD_FLOW_STEPS = 5;
  const progressStepIndex =
    wizardStep >= 2 ? Math.min(WIZARD_FLOW_STEPS, Math.max(1, wizardStep - 1)) : 1;
  const percentComplete = Math.round((progressStepIndex / WIZARD_FLOW_STEPS) * 100);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] px-6 py-14">
        <div className="mx-auto max-w-2xl text-sm text-[#003049]/70">Loading registration…</div>
      </div>
    );
  }

  if (awaitingSignIn && !registrationSessionReady) {
    return (
      <>
        <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-6 py-14">
          <div className="mx-auto w-full max-w-md text-center">
            <h1 className="text-2xl font-extrabold text-[#F77F00]">Complete your registration</h1>
            <p className="mt-3 text-sm leading-relaxed text-[#003049]/80">
              {signInPromptDescription ??
                "Sign in with the email and password you used when creating your account to continue the setup wizard."}
            </p>
          </div>
        </div>
        <SignInDialog
          open={signInDialogOpen}
          onOpenChange={(open) => {
            setSignInDialogOpen(open);
            if (!open && !registrationSessionReady) setAwaitingSignIn(true);
          }}
          description={signInPromptDescription}
          postSignInRedirect={LEARNER_REGISTRATION_WIZARD_PATH}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] px-5 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <header className="px-5 sm:px-6">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-[#F77F00] sm:text-[26px]">
            Complete Your Profile
          </h1>
          <p className="mt-1 text-[15px] font-semibold leading-tight text-[#003049]/80 sm:text-base">
            You&apos;re verified! Now complete your profile to start booking sessions
          </p>
        </header>

        <div className="mt-5 space-y-5">
          <section className="rounded-2xl border border-[#003049]/10 bg-white p-5 sm:p-6">
            <h2 className="text-lg font-bold text-[#003049] sm:text-xl">Profile Photo</h2>
            <p className={sectionBodyClass}>
              Add a photo for a more personal connection with experts.
            </p>
            <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-center">
              <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-[#FFF6EE] text-3xl font-semibold text-[#003049] sm:h-36 sm:w-36 sm:text-4xl">
                {profilePhotoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profilePhotoPreview} alt="Profile preview" className="h-32 w-32 rounded-full object-cover sm:h-36 sm:w-36" />
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

          <section className="rounded-2xl border border-[#003049]/10 bg-white p-5 sm:p-6">
            <h2 className="text-lg font-bold text-[#003049] sm:text-xl">Contact Information</h2>
            <p className={sectionBodyClass}>
              Share your preferred way to receive notifications about upcoming bookings and incoming messages. convene will never share your personal information.
            </p>
            <div className="mt-4 grid gap-3">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First Name" className={manualInputClass} />
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last Name" className={manualInputClass} />
              <Input value={email} readOnly placeholder="Email" className={manualInputClass} />
              <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="Phone Number (for sms reminders)" className={manualInputClass} />
            </div>
          </section>

          <section className="rounded-2xl border border-[#003049]/10 bg-white p-5 sm:p-6">
            <h2 className="text-lg font-bold text-[#003049] sm:text-xl">Booking Information</h2>
            <p className={sectionBodyClass}>{bookingInformationBodyText}</p>
            <div className="mt-4 grid gap-3">
              <Input
                ref={hometownManualRef}
                value={hometown}
                onChange={(e) => onHometownFieldChange(e.target.value)}
                placeholder="Hometown (required)"
                className={manualInputClass}
              />
              <Input
                value={timeZone}
                readOnly={mapsConfigured}
                onChange={mapsConfigured ? undefined : (e) => onTimeZoneFieldChange(e.target.value)}
                placeholder={mapsConfigured ? "Set automatically from hometown" : "Time zone (required)"}
                className={cn(manualInputClass, mapsConfigured && "cursor-default bg-[#F8FAFC]")}
              />
              <p className="text-xs leading-relaxed text-[#003049]/70">
                {mapsConfigured ? bookingTimezoneHintMaps : "Enter a valid IANA time zone (e.g. America/New_York)."}
              </p>
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-[#003049]">
                  Preferred Language
                </Label>
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
            </div>
          </section>

          <section className="rounded-2xl border border-[#003049]/10 bg-white p-5 sm:p-6">
            <h2 className="text-lg font-bold text-[#003049] sm:text-xl">Personal Details</h2>
            <p className={sectionBodyClass}>
              Almost there! Add some information to introduce yourself to Experts.
            </p>
            <div className="mt-4 grid gap-3">
              <Input
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="Profession"
                className={manualInputClass}
              />
              <div>
                <Textarea
                  rows={4}
                  value={introduction}
                  onChange={(e) => setIntroduction(e.target.value)}
                  placeholder="Tell us about yourself, your interests, passions, and what you’re looking to learn."
                  className={manualTextareaClass}
                />
              </div>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="bday"
                maxLength={10}
                value={birthdayInputValue}
                onChange={(e) => {
                  setBirthdayFieldFocused(true);
                  setBirthdayDraft(maskUsDateDigitsFromInput(e.target.value));
                }}
                onFocus={onBirthdayFocus}
                onBlur={onBirthdayBlur}
                placeholder={birthdayInputPlaceholder}
                className={manualInputClass}
                aria-label="Birthday (optional)"
              />
              <div>
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
        </div>

        {draftSaveStatus !== "idle" ? (
          <p className="mt-3 text-center text-xs text-[#003049]/55 sm:text-left" aria-live="polite">
            {draftSaveStatus === "saving" ? "Saving draft…" : null}
            {draftSaveStatus === "saved" ? "All changes saved" : null}
            {draftSaveStatus === "error" ? "Couldn&apos;t save draft — check connection or try again." : null}
          </p>
        ) : null}

        {error ? <p className="mt-5 text-sm text-destructive">{error}</p> : null}

        <div className="mt-6 px-5 sm:px-6">
          <Button
            className="h-11 w-full rounded-lg bg-[#F77F00] text-sm font-bold text-white sm:h-12 sm:text-base"
            disabled={busy}
            onClick={() => void submitManual()}
          >
            {busy ? "Saving…" : "Create Account"}
          </Button>
        </div>
      </div>

      {wizardOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/85 backdrop-blur-[2px] p-4 sm:p-6">
          <div
            className={cn(
              "relative z-20 mx-auto w-full max-h-[min(90vh,820px)] max-w-[min(92vw,620px)] overflow-y-auto rounded-2xl bg-white pb-6 shadow-xl sm:pb-8",
            )}
          >
            <button
              type="button"
              aria-label="Close wizard"
              className="absolute right-3 top-3 z-20 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#F77F00] bg-white text-[#003049] shadow-sm sm:right-4 sm:top-4 sm:h-10 sm:w-10"
              onClick={() => setWizardOpen(false)}
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.5} />
            </button>

            {wizardStep === 1 ? (
              <div className="px-8 pb-10 pt-14 text-center sm:px-10 sm:pb-11 sm:pt-[4.25rem]">
                <Sparkles
                  className="mx-auto h-12 w-12 text-[#003049] sm:h-14 sm:w-14"
                  strokeWidth={1.35}
                  aria-hidden
                />
                <h2 className="mt-6 text-2xl font-extrabold tracking-tight text-[#F77F00] sm:mt-7 sm:text-[26px]">
                  Welcome to convene
                </h2>
                <p className="mx-auto mt-4 max-w-md text-base font-medium leading-relaxed text-[#003049] sm:mt-5 sm:text-lg sm:leading-relaxed">
                  Let&apos;s get you set up quickly and start connecting with experts. This should just take 2-3 minutes.
                </p>
                <div className="mx-auto mt-8 max-w-sm sm:mt-9">
                  <Button
                    className="h-9 w-full rounded-lg bg-[#F77F00] text-sm font-bold text-white sm:h-10"
                    onClick={() => void continueWizard()}
                  >
                    Continue with Setup Wizard
                    <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                  <button
                    type="button"
                    className="mt-3 text-sm font-normal text-[#003049] underline"
                    onClick={() => setWizardOpen(false)}
                  >
                    Enter my details manually
                  </button>
                </div>
              </div>
            ) : null}

            {wizardStep >= 2 && wizardStep <= 6 ? (
              <div className="px-4 pb-6 pt-[4.25rem] sm:pt-[4.75rem] md:px-7 md:pb-7 md:pr-14 md:pt-[4.5rem]">
                <div className="mb-5 pr-1 sm:mb-6">
                  <div className="mb-2 flex items-baseline justify-between gap-3 text-xs font-semibold leading-tight text-[#003049] sm:text-[13px]">
                    <span className="shrink-0">Step {progressStepIndex} of {WIZARD_FLOW_STEPS}</span>
                    <span className="min-w-0 text-right">{percentComplete}% complete</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#E5E7EB]">
                    <div className="h-2.5 rounded-full bg-[#003049]" style={{ width: `${percentComplete}%` }} />
                  </div>
                </div>

                <div className="min-h-0 rounded-xl border border-[#003049]/15 p-5 md:p-6">
                  {wizardStep === 2 ? (
                    <>
                      <WizardSectionHeading Icon={CircleUserRound}>Profile Photo</WizardSectionHeading>
                      <p className={wizardSectionBodyClass}>
                        Let&apos;s add a photo to forge a more personal connection with experts.
                      </p>
                      <div className="mt-5 flex flex-col items-center gap-5 sm:mt-6">
                        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-[#FFF6EE] text-3xl font-semibold text-[#003049] sm:h-36 sm:w-36 sm:text-4xl">
                          {profilePhotoPreview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={profilePhotoPreview} alt="Profile preview" className="h-32 w-32 rounded-full object-cover sm:h-36 sm:w-36" />
                          ) : (
                            initials(firstName, lastName, email)
                          )}
                        </div>
                        <div className="flex w-full max-w-[13.5rem] flex-col space-y-3">
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
                          <button
                            type="button"
                            className="text-center text-xs font-medium text-[#003049] underline underline-offset-2 hover:text-[#F77F00] disabled:opacity-50 sm:text-sm"
                            disabled={busy}
                            onClick={() => void skipWizardPhotoStep()}
                          >
                            Skip for now
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {wizardStep === 3 ? (
                    <>
                      <WizardSectionHeading Icon={Phone}>Contact Information</WizardSectionHeading>
                      <p className={wizardSectionBodyClass}>
                        Share your preferred way to receive notifications about upcoming bookings and incoming messages. convene will never share your personal information.
                      </p>
                      <div className="mt-5 grid gap-3.5 sm:mt-6">
                        <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First Name" className={manualInputClass} />
                        <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last Name" className={manualInputClass} />
                        <Input value={email} readOnly placeholder="Email" className={manualInputClass} />
                        <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="Phone Number (for sms reminders)" className={manualInputClass} />
                      </div>
                    </>
                  ) : null}

                  {wizardStep === 4 ? (
                    <>
                      <WizardSectionHeading Icon={MapPin}>Booking Information</WizardSectionHeading>
                      <p className={wizardSectionBodyClass}>{bookingInformationBodyText}</p>
                      <div className="mt-5 grid gap-3.5 sm:mt-6">
                        <Input
                          ref={hometownWizardRef}
                          value={hometown}
                          onChange={(e) => onHometownFieldChange(e.target.value)}
                          placeholder="Hometown (required)"
                          className={manualInputClass}
                        />
                        <Input
                          value={timeZone}
                          readOnly={mapsConfigured}
                          onChange={mapsConfigured ? undefined : (e) => onTimeZoneFieldChange(e.target.value)}
                          placeholder={mapsConfigured ? "Set automatically from hometown" : "Time zone (required)"}
                          className={cn(manualInputClass, mapsConfigured && "cursor-default bg-[#F8FAFC]")}
                        />
                        <p className="text-xs leading-relaxed text-[#003049]/70">
                          {mapsConfigured ? bookingTimezoneHintMaps : "Enter a valid IANA time zone (e.g. America/New_York)."}
                        </p>
                        <div>
                          <Label className="mb-1.5 block text-xs font-medium text-[#003049]">
                            Preferred Language
                          </Label>
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
                      </div>
                    </>
                  ) : null}

                  {wizardStep === 5 ? (
                    <>
                      <WizardSectionHeading Icon={UserRoundPen}>Personal Details</WizardSectionHeading>
                      <p className={wizardSectionBodyClass}>
                        Almost there! Add some information to introduce yourself to Experts.
                      </p>
                      <div className="mt-5 grid gap-3.5 sm:mt-6">
                        <Input
                          value={profession}
                          onChange={(e) => setProfession(e.target.value)}
                          placeholder="Profession"
                          className={manualInputClass}
                        />
                        <Textarea
                          rows={4}
                          value={introduction}
                          onChange={(e) => setIntroduction(e.target.value)}
                          placeholder="Tell us about yourself, your interests, passions, and what you’re looking to learn."
                          className={manualTextareaClass}
                        />
                        <Input
                          type="text"
                          inputMode="numeric"
                          autoComplete="bday"
                          maxLength={10}
                          value={birthdayInputValue}
                          onChange={(e) => {
                            setBirthdayFieldFocused(true);
                            setBirthdayDraft(maskUsDateDigitsFromInput(e.target.value));
                          }}
                          onFocus={onBirthdayFocus}
                          onBlur={onBirthdayBlur}
                          placeholder={birthdayInputPlaceholder}
                          className={manualInputClass}
                          aria-label="Birthday (optional)"
                        />
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
                    </>
                  ) : null}

                  {wizardStep === 6 ? (
                    <>
                      <div className="flex flex-col items-center text-center">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#F77F00] text-white shadow-md sm:h-[72px] sm:w-[72px]">
                          <Check className="h-9 w-9 sm:h-10 sm:w-10" strokeWidth={2.75} aria-hidden />
                        </div>
                        <h2 className="mt-4 text-xl font-bold tracking-tight text-[#003049] sm:text-2xl">
                          Review &amp; Complete
                        </h2>
                        <p className="mt-2 max-w-lg text-[13px] font-medium leading-relaxed text-[#003049]/90 sm:text-sm">
                          Review your information below. You can edit any field before creating your account.
                        </p>
                      </div>

                      <div className="mt-8 space-y-8 text-left">
                        <section>
                          <h3 className="text-sm font-bold text-[#003049] sm:text-[15px]">Profile Photo</h3>
                          <div className="mt-3 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                            <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-[#FFF6EE] text-2xl font-semibold text-[#003049] ring-1 ring-[#003049]/10 sm:h-32 sm:w-32 sm:text-3xl">
                              {profilePhotoPreview ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={profilePhotoPreview}
                                  alt=""
                                  className="h-full w-full rounded-full object-cover"
                                />
                              ) : (
                                initials(firstName, lastName, email)
                              )}
                            </div>
                            <div className="flex flex-col gap-2">
                              <h4 className="text-xs font-bold uppercase tracking-wide text-[#003049]/70">Change Photo</h4>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-10 rounded-xl border-2 border-[#003049] text-sm font-semibold text-[#003049] hover:bg-[#003049]/5"
                                  onClick={() => uploadFileRef.current?.click()}
                                >
                                  <Upload className="mr-2 h-4 w-4" />
                                  Upload Photo
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-10 rounded-xl border-2 border-[#003049] text-sm font-semibold text-[#003049] hover:bg-[#003049]/5"
                                  onClick={() => void openLiveCamera()}
                                >
                                  <Camera className="mr-2 h-4 w-4" />
                                  Take a Photo
                                </Button>
                              </div>
                            </div>
                          </div>
                        </section>

                        <section>
                          <h3 className="text-sm font-bold text-[#003049] sm:text-[15px]">Contact Information</h3>
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
                            <div>
                              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">First Name</Label>
                              <Input
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                className={manualInputClass}
                              />
                            </div>
                            <div>
                              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Last Name</Label>
                              <Input
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                className={manualInputClass}
                              />
                            </div>
                            <div>
                              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Email</Label>
                              <Input value={email} readOnly className={manualInputClass} />
                            </div>
                            <div>
                              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Phone (optional)</Label>
                              <Input
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                placeholder="Phone Number"
                                className={manualInputClass}
                              />
                            </div>
                          </div>
                        </section>

                        <section>
                          <h3 className="text-sm font-bold text-[#003049] sm:text-[15px]">Booking Information</h3>
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
                            <div className="sm:col-span-2">
                              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Hometown</Label>
                              <Input
                                ref={hometownWizardRef}
                                value={hometown}
                                onChange={(e) => onHometownFieldChange(e.target.value)}
                                placeholder="Hometown (required)"
                                className={manualInputClass}
                              />
                            </div>
                            <div>
                              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Time zone</Label>
                              <Input
                                value={timeZone}
                                readOnly={mapsConfigured}
                                onChange={mapsConfigured ? undefined : (e) => onTimeZoneFieldChange(e.target.value)}
                                placeholder={mapsConfigured ? "Set automatically from hometown" : "Time zone (required)"}
                                className={cn(manualInputClass, mapsConfigured && "cursor-default bg-[#F8FAFC]")}
                              />
                              <p className="mt-1 text-[11px] leading-snug text-[#003049]/70 sm:text-xs">
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
                          </div>
                        </section>

                        <section>
                          <h3 className="text-sm font-bold text-[#003049] sm:text-[15px]">Personal Details</h3>
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:gap-y-3">
                            <div>
                              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Profession</Label>
                              <Input
                                value={profession}
                                onChange={(e) => setProfession(e.target.value)}
                                placeholder="Profession"
                                className={manualInputClass}
                              />
                            </div>
                            <div>
                              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Introduction</Label>
                              <Textarea
                                rows={4}
                                value={introduction}
                                onChange={(e) => setIntroduction(e.target.value)}
                                placeholder="Tell us about yourself, your interests, passions, and what you’re looking to learn."
                                className={manualTextareaClass}
                              />
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4">
                              <div>
                                <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Birthday</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  autoComplete="bday"
                                  maxLength={10}
                                  value={birthdayInputValue}
                                  onChange={(e) => {
                                    setBirthdayFieldFocused(true);
                                    setBirthdayDraft(maskUsDateDigitsFromInput(e.target.value));
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
                          </div>
                        </section>
                      </div>
                    </>
                  ) : null}
                </div>

                {error ? <p className="mt-5 text-sm text-destructive sm:mt-6">{error}</p> : null}

                <div className="mt-6 flex items-center justify-between gap-3 sm:mt-7">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-lg border-2 border-[#003049] px-4 text-sm font-bold text-[#003049] sm:h-10 sm:px-5"
                    disabled={busy || wizardStep <= 2}
                    onClick={() => {
                      if (wizardStep === 5) flushBirthdayDraft();
                      setWizardStep((s) => Math.max(2, s - 1));
                    }}
                  >
                    <ChevronLeft className="mr-1.5 h-3.5 w-3.5" />
                    Back
                  </Button>
                  <Button
                    type="button"
                    className={cn(
                      "h-9 rounded-lg bg-[#F77F00] px-4 text-sm font-bold text-white sm:h-10 sm:px-5",
                      wizardStep === 6 && "inline-flex items-center justify-center gap-2",
                    )}
                    disabled={busy}
                    onClick={() => void continueWizard()}
                  >
                    {busy ? (
                      "Saving…"
                    ) : wizardStep === 6 ? (
                      <>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-white/90 bg-white/20">
                          <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} aria-hidden />
                        </span>
                        Create Account
                      </>
                    ) : (
                      <>
                        Continue
                        <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {cameraOpen ? (
        <div className="fixed inset-0 z-[59] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-[#003049] sm:text-lg">Take a profile photo</h3>
              <button type="button" onClick={stopLiveCamera} className="rounded border px-2 py-1 text-xs sm:text-sm">
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
              <button type="button" onClick={() => setEditorOpen(false)} className="rounded border px-2 py-1 text-xs sm:text-sm">
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
              <Button className="h-9 text-sm" disabled={busy} onClick={() => void uploadEditedPhoto()}>
                {busy ? "Uploading…" : "Use photo"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

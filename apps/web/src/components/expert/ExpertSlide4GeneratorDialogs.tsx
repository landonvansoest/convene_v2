"use client";

import { useState } from "react";
import { Check, Loader2, RefreshCw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function GeneratorBusyOverlay({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-lg bg-white/85 backdrop-blur-[1px]">
      <Loader2 className="h-9 w-9 animate-spin text-[#F77F00]" aria-hidden />
      <p className="animate-pulse text-sm font-semibold text-[#003049]">{label}</p>
    </div>
  );
}

function GeneratorDialogHeading({ title }: { title: string }) {
  return (
    <DialogTitle className="flex items-center gap-2.5 text-left text-[#003049]">
      <Wand2 className="h-5 w-5 shrink-0 text-[#F77F00]" strokeWidth={2} aria-hidden />
      <span>{title}</span>
    </DialogTitle>
  );
}

/** Services generator — trigger sits below the services textarea. */
export function ServicesGeneratorDialog({
  manualInputClass,
  onServicesGenerated,
}: {
  manualInputClass: string;
  onServicesGenerated: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [svcSkills, setSvcSkills] = useState("");
  const [svcTeaching, setSvcTeaching] = useState("");
  const [svcAudience, setSvcAudience] = useState("");

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/expert-registration/generate/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: svcSkills.trim(),
          teachingBackground: svcTeaching.trim(),
          audience: svcAudience.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && typeof json.services === "string") {
        onServicesGenerated(json.services);
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="mt-2 inline-flex items-center gap-2 px-0 py-1 text-sm font-normal text-[#003049] hover:text-[#F77F00] disabled:opacity-50"
        onClick={() => setOpen(true)}
        disabled={busy}
      >
        <Wand2 className="h-4 w-4 text-[#F77F00]" aria-hidden />
        Generate Service Description
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="relative">
            <GeneratorBusyOverlay show={busy} label="Working on your description…" />
            <DialogHeader>
              <GeneratorDialogHeading title="Services Generator" />
              <DialogDescription className="text-sm leading-snug text-muted-foreground">
                Answer a few prompts and we&apos;ll help write a short description for you.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>What specific skill or skills are you best at teaching?</Label>
              <Input
                value={svcSkills}
                onChange={(e) => setSvcSkills(e.target.value)}
                placeholder="e.g. Debugging production systems, interview prep, portfolio reviews"
                className={manualInputClass}
              />
            </div>
            <div className="space-y-2">
              <Label>How have you taught or coached others in the past?</Label>
              <Input
                value={svcTeaching}
                onChange={(e) => setSvcTeaching(e.target.value)}
                placeholder="e.g. Mentored junior devs at work, ran a weekend workshop series"
                className={manualInputClass}
              />
            </div>
            <div className="space-y-2">
              <Label>Who would benefit the most from your consulting?</Label>
              <Input
                value={svcAudience}
                onChange={(e) => setSvcAudience(e.target.value)}
                placeholder="e.g. Beginners, career changers, professionals sharpening skills"
                className={manualInputClass}
              />
            </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void run()} disabled={busy}>
                {busy ? "Generating…" : "Generate"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Skills suggestions — v1-style two-column selectable rows. */
export function SkillsSuggestionDialog({
  profession,
  expertBio,
  qualificationItems,
  existingSkills,
  onSkillsAdd,
}: {
  profession: string;
  expertBio: string;
  qualificationItems: string[];
  existingSkills: string[];
  onSkillsAdd: (skills: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suggestedSkills, setSuggestedSkills] = useState<string[]>([]);
  const [selectedSuggest, setSelectedSuggest] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async (regen: boolean) => {
    setBusy(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/expert-registration/generate/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profession,
          bio: expertBio,
          qualifications: qualificationItems,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { skills?: unknown; error?: string };
      if (res.ok && Array.isArray(json.skills)) {
        setSuggestedSkills(json.skills.map((s: unknown) => String(s).trim()).filter(Boolean));
        if (regen) setSelectedSuggest(new Set());
      } else {
        setSuggestedSkills([]);
        setLoadError(
          typeof json.error === "string" && json.error.trim()
            ? json.error
            : "Could not load suggestions. Check your connection and try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleSelect = (s: string) => {
    setSelectedSuggest((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const addSelected = () => {
    const cap = 30 - existingSkills.length;
    const add = Array.from(selectedSuggest)
      .filter((s) => !existingSkills.includes(s))
      .slice(0, Math.max(0, cap));
    if (add.length) onSkillsAdd(add);
    setOpen(false);
  };

  const n = selectedSuggest.size;

  return (
    <>
      <button
        type="button"
        className="mt-2 inline-flex items-center gap-2 px-0 py-1 text-sm font-normal text-[#003049] hover:text-[#F77F00] disabled:opacity-50"
        onClick={() => {
          setOpen(true);
          void load(false);
        }}
        disabled={busy}
      >
        <Wand2 className="h-4 w-4 text-[#F77F00]" aria-hidden />
        Suggest Relevant Skills
      </button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setLoadError(null);
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-[540px]">
          <div className="relative flex min-h-0 flex-1 flex-col">
            <GeneratorBusyOverlay show={busy} label="Finding skills that fit your profile…" />
            <DialogHeader className="shrink-0 space-y-2 text-left">
              <GeneratorDialogHeading title="Suggested Skills & Specializations" />
              <DialogDescription className="text-sm leading-snug text-[#003049]/80">
                Based on your profile, here are some relevant skills you might want to add. Select the ones that apply to
                you.
              </DialogDescription>
              {loadError ? (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {loadError}
                </p>
              ) : null}
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto py-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {suggestedSkills.map((s) => {
                  const on = selectedSuggest.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSelect(s)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                        on
                          ? "border-[#F77F00] bg-[#FFF6EE] text-[#003049]"
                          : "border-[#003049]/20 bg-white text-[#003049] hover:bg-[#F8FAFC]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 rounded-full border-2 border-[#F77F00]",
                          on ? "bg-[#F77F00]" : "bg-white",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 leading-snug">{s}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <DialogFooter className="shrink-0 flex-col gap-3 border-t border-[#003049]/10 pt-4 sm:flex-col">
              <Button
                type="button"
                className="h-11 w-full gap-2 rounded-xl bg-[#F77F00] text-base font-bold text-white hover:bg-[#e07400]"
                onClick={addSelected}
                disabled={busy || n === 0}
              >
                <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                Add Selected Skills ({n})
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 rounded-xl border-2 border-[#003049] font-semibold text-[#003049]"
                  onClick={() => void load(true)}
                  disabled={busy}
                >
                  <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} aria-hidden />
                  Regenerate
                </Button>
                <button
                  type="button"
                  className="text-sm font-semibold text-[#003049] underline-offset-4 hover:underline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BioGeneratorDialog({
  profession,
  qualificationItems,
  manualInputClass,
  onBioGenerated,
}: {
  profession: string;
  qualificationItems: string[];
  manualInputClass: string;
  onBioGenerated: (bio: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bioExpertise, setBioExpertise] = useState("");
  const [bioAchievements, setBioAchievements] = useState("");
  const [bioFavorite, setBioFavorite] = useState("");

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/expert-registration/generate/bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profession,
          expertise: bioExpertise.trim() || profession,
          achievements: bioAchievements.trim(),
          favorite: bioFavorite.trim(),
          qualifications: qualificationItems,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && typeof json.bio === "string") {
        onBioGenerated(json.bio);
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="mt-2 inline-flex items-center gap-2 px-0 py-1 text-sm font-normal text-[#003049] hover:text-[#F77F00] disabled:opacity-50"
        onClick={() => setOpen(true)}
        disabled={busy}
      >
        <Wand2 className="h-4 w-4 text-[#F77F00]" aria-hidden />
        Generate Bio
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="relative">
            <GeneratorBusyOverlay show={busy} label="Writing your bio…" />
            <DialogHeader>
              <GeneratorDialogHeading title="Bio Generator" />
              <DialogDescription className="text-sm leading-snug text-muted-foreground">
                Tell us a little about yourself and we&apos;ll create a personalized bio for you. Here are some prompts to
                get you started:
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>What is your main area of expertise or specialization?</Label>
                <Input
                  value={bioExpertise}
                  onChange={(e) => setBioExpertise(e.target.value)}
                  placeholder="e.g. Full-stack web development, Wood Turning"
                  className={manualInputClass}
                />
              </div>
              <div className="space-y-2">
                <Label>Notable achievements or credentials</Label>
                <Input
                  value={bioAchievements}
                  onChange={(e) => setBioAchievements(e.target.value)}
                  placeholder="e.g. Published author, worked with Fortune 500 companies"
                  className={manualInputClass}
                />
              </div>
              <div className="space-y-2">
                <Label>What is your favorite thing about your field?</Label>
                <Input
                  value={bioFavorite}
                  onChange={(e) => setBioFavorite(e.target.value)}
                  placeholder="e.g. Helping people solve complex problems"
                  className={manualInputClass}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void run()} disabled={busy}>
                {busy ? "Generating…" : "Generate bio"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

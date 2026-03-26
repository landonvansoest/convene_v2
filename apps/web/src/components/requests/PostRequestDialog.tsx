"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Info, Send, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SKILLS_BY_CATEGORY } from "@/components/search/skillsByCategory";

type Cat = { category_id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PostRequestDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [categories, setCategories] = useState<Cat[]>([]);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    let c = false;
    void fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => {
        if (!c) setCategories((d.categories as Cat[]) ?? []);
      })
      .catch(() => {
        if (!c) setCategories([]);
      });
    return () => {
      c = true;
    };
  }, [open]);

  const categoryName = useMemo(() => {
    if (!categoryId) return "";
    return categories.find((x) => x.category_id === categoryId)?.name ?? "";
  }, [categories, categoryId]);

  const suggestedSkills = useMemo(() => {
    if (!categoryName) return [];
    const pool = SKILLS_BY_CATEGORY[categoryName] ?? [];
    return pool.filter(
      (skill) =>
        !selectedSkills.includes(skill) && skill.toLowerCase().includes(skillInput.toLowerCase())
    );
  }, [categoryName, selectedSkills, skillInput]);

  function addSkill(skill: string) {
    if (!selectedSkills.includes(skill)) setSelectedSkills([...selectedSkills, skill]);
  }

  function removeSkill(skill: string) {
    setSelectedSkills(selectedSkills.filter((s) => s !== skill));
  }

  function addSkillFromInput() {
    const s = skillInput.trim();
    if (s && !selectedSkills.includes(s)) {
      setSelectedSkills([...selectedSkills, s]);
      setSkillInput("");
    }
  }

  function resetForm() {
    setTitle("");
    setDetails("");
    setCategoryId("");
    setSelectedSkills([]);
    setSkillInput("");
    setIsPublic(true);
    setErr(null);
  }

  async function handleSubmit() {
    if (!title.trim() || !details.trim() || !categoryId) {
      setErr("Please fill in title, details, and category.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim().slice(0, 150),
        description: details.trim().slice(0, 1000),
        category_id: categoryId,
        skills: selectedSkills.slice(0, 10),
        is_public: isPublic,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Failed to post");
      return;
    }
    setSuccess(true);
  }

  function handleSuccessClose() {
    setSuccess(false);
    resetForm();
    onOpenChange(false);
  }

  return (
    <>
      <Dialog
        open={open && !success}
        onOpenChange={(o) => {
          if (!o) resetForm();
          onOpenChange(o);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl text-[#003049]">Post a request</DialogTitle>
            <DialogDescription>
              Describe what you need; experts can respond from the community board (Bible: public requests + skills +
              category).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="pr-title">One sentence description</Label>
              <Input
                id="pr-title"
                placeholder="e.g., Need help fixing a leaky faucet"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={150}
              />
              <p className="text-xs text-muted-foreground">{title.length}/150</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pr-details">Details</Label>
              <Textarea
                id="pr-details"
                placeholder="The more specific you are, the better experts can help."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={6}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground">{details.length}/1000</p>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryId || undefined} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.category_id} value={cat.category_id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Special skills</Label>
              <div className="mb-2 flex flex-wrap gap-2">
                {selectedSkills.map((skill) => (
                  <Badge key={skill} variant="secondary" className="gap-1">
                    {skill}
                    <button type="button" onClick={() => removeSkill(skill)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a skill (Enter)"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSkillFromInput();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addSkillFromInput} disabled={!skillInput.trim()}>
                  Add
                </Button>
              </div>
              {suggestedSkills.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  <span className="w-full text-xs text-muted-foreground">Suggested:</span>
                  {suggestedSkills.slice(0, 12).map((skill) => (
                    <Badge
                      key={skill}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                      onClick={() => addSkill(skill)}
                    >
                      + {skill}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <TooltipProvider>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="pr-public" className="cursor-pointer">
                    Public
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground" aria-label="About public requests">
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Public requests are added to the community message board. This helps other users with similar
                      questions find answers and relevant experts.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Switch id="pr-public" checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
            </TooltipProvider>

            {err ? <p className="text-sm text-destructive">{err}</p> : null}
          </div>

          <div className="flex justify-between border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
              }}
            >
              Clear form
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="gap-2 bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                disabled={busy}
                onClick={() => void handleSubmit()}
              >
                {busy ? "Posting…" : (
                  <>
                    <Send className="h-4 w-4" />
                    Post request
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={success} onOpenChange={(o) => !o && handleSuccessClose()}>
        <DialogContent className="max-w-md">
          <div className="flex flex-col items-center space-y-4 py-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-10 w-10 text-emerald-600" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-2xl">Posted</DialogTitle>
              <DialogDescription className="text-base">
                Your request is live. Experts can respond from the community board. You can track it under Your
                Requests on the dashboard.
              </DialogDescription>
            </DialogHeader>
            <div className="flex w-full gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={handleSuccessClose}>
                Close
              </Button>
              <Button
                type="button"
                className="flex-1 bg-[#003049]"
                onClick={() => {
                  setSuccess(false);
                  resetForm();
                  onOpenChange(false);
                  router.push("/dashboard?view=requests");
                }}
              >
                View dashboard
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

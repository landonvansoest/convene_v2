"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import type { AdvancedSearchFilters } from "@/lib/advancedSearchUrl";
import { buildAdvancedSearchUrl } from "@/lib/advancedSearchUrl";
import { SKILLS_BY_CATEGORY } from "@/components/search/skillsByCategory";
import { useRouter } from "next/navigation";

type Cat = { category_id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKeywords?: string;
};

export function AdvancedSearchDialog({ open, onOpenChange, initialKeywords = "" }: Props) {
  const router = useRouter();
  const [categories, setCategories] = useState<Cat[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [profession, setProfession] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [keywords, setKeywords] = useState(initialKeywords);
  const [minRating, setMinRating] = useState([0]);
  const [maxRate, setMaxRate] = useState([250]);
  const [availableNow, setAvailableNow] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKeywords(initialKeywords);
  }, [open, initialKeywords]);

  useEffect(() => {
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
  }, []);

  const categoryName = useMemo(() => {
    if (!categoryId) return "";
    return categories.find((x) => x.category_id === categoryId)?.name ?? "";
  }, [categories, categoryId]);

  const suggestedSkills = useMemo(() => {
    if (!categoryName || categoryName === "Other") return [];
    const pool = SKILLS_BY_CATEGORY[categoryName] ?? [];
    if (!profession.trim()) return [];
    return pool.filter(
      (skill) =>
        !selectedSkills.includes(skill) && skill.toLowerCase().includes(skillInput.toLowerCase())
    );
  }, [categoryName, profession, selectedSkills, skillInput]);

  function handleAddSkill(skill: string) {
    if (!selectedSkills.includes(skill)) setSelectedSkills([...selectedSkills, skill]);
  }

  function handleRemoveSkill(skill: string) {
    setSelectedSkills(selectedSkills.filter((s) => s !== skill));
  }

  function handleAddSkillFromInput() {
    const s = skillInput.trim();
    if (s && !selectedSkills.includes(s)) {
      setSelectedSkills([...selectedSkills, s]);
      setSkillInput("");
    }
  }

  function handleSearch() {
    const filters: AdvancedSearchFilters = {
      keywords,
      categoryId,
      profession,
      skills: selectedSkills,
      minRating: minRating[0],
      maxRate: maxRate[0],
      availableNow,
      verifiedOnly,
    };
    router.push(buildAdvancedSearchUrl(filters));
    onOpenChange(false);
  }

  function handleReset() {
    setCategoryId("");
    setProfession("");
    setSkillInput("");
    setSelectedSkills([]);
    setKeywords("");
    setMinRating([0]);
    setMaxRate([250]);
    setAvailableNow(false);
    setVerifiedOnly(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl text-[#003049]">Advanced Search</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={categoryId || "all"} onValueChange={(v) => setCategoryId(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.category_id} value={cat.category_id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adv-profession">Profession</Label>
            <Input
              id="adv-profession"
              placeholder="e.g., Plumber, Web Developer, Math Tutor"
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Specific skills</Label>
            <div className="mb-2 flex flex-wrap gap-2">
              {selectedSkills.map((skill) => (
                <Badge key={skill} variant="secondary" className="gap-1">
                  {skill}
                  <button type="button" onClick={() => handleRemoveSkill(skill)} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Type a skill…"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSkillFromInput();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={handleAddSkillFromInput} disabled={!skillInput.trim()}>
                Add
              </Button>
            </div>
            {suggestedSkills.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="w-full text-xs text-muted-foreground">Suggested:</span>
                {suggestedSkills.slice(0, 10).map((skill) => (
                  <Badge
                    key={skill}
                    variant="outline"
                    className="cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground"
                    onClick={() => handleAddSkill(skill)}
                  >
                    + {skill}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="adv-keywords">Keywords</Label>
            <Input
              id="adv-keywords"
              placeholder="Additional keywords…"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Minimum rating: {minRating[0].toFixed(1)} stars</Label>
            <Slider value={minRating} onValueChange={setMinRating} min={0} max={5} step={0.5} className="w-full" />
          </div>

          <div className="space-y-2">
            <Label>Max rate ($ / 15 min): ${maxRate[0]}</Label>
            <Slider value={maxRate} onValueChange={setMaxRate} min={5} max={250} step={5} className="w-full" />
          </div>

          <div className="space-y-3">
            <Label>Quick filters</Label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setAvailableNow(!availableNow)}
                className={`rounded-lg border px-4 py-2 transition-colors ${
                  availableNow ? "border-green-600 bg-green-600 text-white" : "border-input hover:bg-accent"
                }`}
              >
                Available now
              </button>
              <button
                type="button"
                onClick={() => setVerifiedOnly(!verifiedOnly)}
                className={`rounded-lg border px-4 py-2 transition-colors ${
                  verifiedOnly ? "border-[#003049] bg-[#003049] text-white" : "border-input hover:bg-accent"
                }`}
              >
                Verified only
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-between border-t pt-4">
          <Button type="button" variant="outline" onClick={handleReset}>
            Reset filters
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" className="gap-2 bg-[#F77F00] text-white hover:bg-[#F77F00]/90" onClick={handleSearch}>
              <Search className="h-4 w-4" />
              Search
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

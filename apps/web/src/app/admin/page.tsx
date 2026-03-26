"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { LayoutGrid, Shield, Tag, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

type AdminCat = {
  category_id: string;
  name: string;
  icon: string | null;
  is_active: boolean;
};

type Pending = {
  user_id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  expert_status?: string | null;
};

export default function AdminPendingExpertsPage() {
  const [secret, setSecret] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [categories, setCategories] = useState<AdminCat[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catErr, setCatErr] = useState<string | null>(null);
  const [catMsg, setCatMsg] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("");

  const [featLoading, setFeatLoading] = useState(false);
  const [featErr, setFeatErr] = useState<string | null>(null);
  const [featMsg, setFeatMsg] = useState<string | null>(null);
  const [featIncludeTemp, setFeatIncludeTemp] = useState(true);
  const [featIncludePending, setFeatIncludePending] = useState(false);
  const [featMinSessions, setFeatMinSessions] = useState("");
  const [featRequireVerified, setFeatRequireVerified] = useState(false);
  const [featMinRating, setFeatMinRating] = useState("");

  function authHeaders(): HeadersInit {
    const h: Record<string, string> = {};
    if (secret.trim()) h.Authorization = `Bearer ${secret.trim()}`;
    return h;
  }

  async function fetchPending() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/check-pending-experts", { headers: authHeaders() });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed");
      setPending([]);
      return;
    }
    setPending((data.pendingExperts as Pending[]) ?? []);
  }

  async function approve(userId: string) {
    setActionMsg(null);
    const res = await fetch(`/api/experts/${encodeURIComponent(userId)}/approve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action: "approve" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setActionMsg(typeof data.error === "string" ? data.error : "Approve failed");
      return;
    }
    setActionMsg(typeof data.message === "string" ? data.message : "Approved.");
    await fetchPending();
  }

  async function reject(userId: string) {
    setActionMsg(null);
    const res = await fetch(`/api/experts/${encodeURIComponent(userId)}/approve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ action: "reject" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setActionMsg(typeof data.error === "string" ? data.error : "Reject failed");
      return;
    }
    setActionMsg(typeof data.message === "string" ? data.message : "Rejected.");
    await fetchPending();
  }

  function onLoad(e: FormEvent) {
    e.preventDefault();
    void fetchPending();
  }

  async function loadCategories() {
    setCatLoading(true);
    setCatErr(null);
    const res = await fetch("/api/admin/categories", { headers: authHeaders() });
    const data = await res.json();
    setCatLoading(false);
    if (!res.ok) {
      setCatErr(typeof data.error === "string" ? data.error : "Failed to load categories");
      setCategories([]);
      return;
    }
    setCategories((data.categories as AdminCat[]) ?? []);
  }

  async function onCreateCategory(e: FormEvent) {
    e.preventDefault();
    setCatMsg(null);
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        name: newCatName.trim(),
        icon: newCatIcon.trim() || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCatMsg(typeof data.error === "string" ? data.error : "Create failed");
      return;
    }
    setNewCatName("");
    setNewCatIcon("");
    setCatMsg("Category created.");
    await loadCategories();
  }

  async function loadFeaturedSettings() {
    setFeatLoading(true);
    setFeatErr(null);
    const res = await fetch("/api/admin/featured-experts-settings", { headers: authHeaders() });
    const data = await res.json();
    setFeatLoading(false);
    if (!res.ok) {
      setFeatErr(typeof data.error === "string" ? data.error : "Failed to load featured rules");
      return;
    }
    const s = data.settings as {
      include_temp: boolean;
      include_pending: boolean;
      min_complete_sessions: number | null;
      require_verified: boolean;
      min_avg_rating: number | null;
    };
    setFeatIncludeTemp(s.include_temp);
    setFeatIncludePending(s.include_pending);
    setFeatMinSessions(s.min_complete_sessions == null ? "" : String(s.min_complete_sessions));
    setFeatRequireVerified(s.require_verified);
    setFeatMinRating(s.min_avg_rating == null ? "" : String(s.min_avg_rating));
  }

  async function saveFeaturedSettings() {
    setFeatMsg(null);
    setFeatErr(null);
    const minS = featMinSessions.trim() === "" ? null : Number(featMinSessions);
    const minR = featMinRating.trim() === "" ? null : Number(featMinRating);
    if (minS != null && (!Number.isFinite(minS) || minS < 0)) {
      setFeatErr("Min completed sessions must be a non-negative integer or empty.");
      return;
    }
    if (minR != null && (!Number.isFinite(minR) || minR < 1 || minR > 5)) {
      setFeatErr("Min average rating must be between 1 and 5 or empty.");
      return;
    }
    const res = await fetch("/api/admin/featured-experts-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        include_temp: featIncludeTemp,
        include_pending: featIncludePending,
        min_complete_sessions: minS,
        require_verified: featRequireVerified,
        min_avg_rating: minR,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeatErr(typeof data.error === "string" ? data.error : "Save failed");
      return;
    }
    setFeatMsg("Featured list rules saved.");
    if (data.settings) {
      const s = data.settings as { min_complete_sessions: number | null; min_avg_rating: number | null };
      setFeatMinSessions(s.min_complete_sessions == null ? "" : String(s.min_complete_sessions));
      setFeatMinRating(s.min_avg_rating == null ? "" : String(s.min_avg_rating));
    }
  }

  async function toggleCategoryActive(cat: AdminCat) {
    setCatMsg(null);
    const res = await fetch(`/api/admin/categories/${encodeURIComponent(cat.category_id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ is_active: !cat.is_active }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCatMsg(typeof data.error === "string" ? data.error : "Update failed");
      return;
    }
    await loadCategories();
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 text-foreground">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <div className="flex items-center gap-2 text-[#003049]">
            <Shield className="h-7 w-7 text-[#F77F00]" />
            <h1 className="text-2xl font-semibold">Admin</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Use <code className="rounded bg-[#003049]/5 px-1.5 py-0.5 text-xs">ADMIN_DASHBOARD_SECRET</code> as Bearer,
            or sign in as{" "}
            <code className="rounded bg-[#003049]/5 px-1.5 py-0.5 text-xs">ADMIN_EMAIL</code>.
          </p>
        </div>

        <Card className="border-2 border-[#003049]/10 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#F77F00]" />
              <CardTitle className="text-lg text-[#003049]">Pending experts</CardTitle>
            </div>
            <CardDescription>Approve or reject experts in temp/pending status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={onLoad} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="admin-secret">Optional Bearer secret</Label>
                <Input
                  id="admin-secret"
                  type="password"
                  autoComplete="off"
                  className="border-[#003049]/15 font-mono text-sm"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="ADMIN_DASHBOARD_SECRET"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90 sm:shrink-0"
              >
                {loading ? "Loading…" : "Load pending"}
              </Button>
            </form>
            {error ? (
              <p className="text-sm text-destructive">
                {error}{" "}
                <Link href="/login" className="font-medium text-[#F77F00] underline underline-offset-2">
                  Sign in
                </Link>
              </p>
            ) : null}
            {actionMsg ? <p className="text-sm text-emerald-600">{actionMsg}</p> : null}

            {!loading && pending.length === 0 && !error ? (
              <p className="text-sm text-muted-foreground">Load pending to see experts in temp/pending.</p>
            ) : null}

            <ul className="space-y-3">
              {pending.map((p) => (
                <li
                  key={p.user_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#003049]/10 bg-gray-50/80 p-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[#003049]">
                      {(p.first_name ?? "").trim()} {(p.last_name ?? "").trim()}
                      {p.email ? (
                        <span className="ml-2 font-normal text-muted-foreground">({p.email})</span>
                      ) : null}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground break-all">{p.user_id}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Status: {p.expert_status ?? "—"}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                      onClick={() => void approve(p.user_id)}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => void reject(p.user_id)}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-2 border-[#003049]/10 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-[#F77F00]" />
              <CardTitle className="text-lg text-[#003049]">Featured &amp; browse experts</CardTitle>
            </div>
            <CardDescription>
              Controls who appears in the homepage featured grid and in{" "}
              <code className="text-xs">GET /api/experts</code> (search and /experts page). Apply migration{" "}
              <code className="text-xs">010_featured_experts_settings.sql</code> on v2 if this fails to load.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-[#003049]/20 text-[#003049]"
                onClick={() => void loadFeaturedSettings()}
                disabled={featLoading}
              >
                {featLoading ? "Loading…" : "Load current rules"}
              </Button>
              <Button
                type="button"
                className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                onClick={() => void saveFeaturedSettings()}
              >
                Save rules
              </Button>
            </div>
            {featErr ? <p className="text-sm text-destructive">{featErr}</p> : null}
            {featMsg ? <p className="text-sm text-emerald-600">{featMsg}</p> : null}

            <div className="flex items-center justify-between gap-4 rounded-lg border border-[#003049]/10 bg-gray-50/50 px-4 py-3">
              <div>
                <Label htmlFor="feat-temp" className="text-[#003049]">
                  Include <strong>temp</strong> experts
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Turn off before launch to hide migrated / non-approved profiles from public lists.
                </p>
              </div>
              <Switch id="feat-temp" checked={featIncludeTemp} onCheckedChange={setFeatIncludeTemp} />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-[#003049]/10 bg-gray-50/50 px-4 py-3">
              <div>
                <Label htmlFor="feat-pending" className="text-[#003049]">
                  Include <strong>pending</strong> experts
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">Usually leave off; only for internal testing.</p>
              </div>
              <Switch id="feat-pending" checked={featIncludePending} onCheckedChange={setFeatIncludePending} />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-[#003049]/10 bg-gray-50/50 px-4 py-3">
              <div>
                <Label htmlFor="feat-verified" className="text-[#003049]">
                  Require verified badge
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">Only experts with is_verified = true.</p>
              </div>
              <Switch id="feat-verified" checked={featRequireVerified} onCheckedChange={setFeatRequireVerified} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="feat-min-sessions">Min completed sessions (optional)</Label>
                <Input
                  id="feat-min-sessions"
                  inputMode="numeric"
                  className="border-[#003049]/15"
                  placeholder="e.g. 5"
                  value={featMinSessions}
                  onChange={(e) => setFeatMinSessions(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="feat-min-rating">Min average rating 1–5 (optional)</Label>
                <Input
                  id="feat-min-rating"
                  inputMode="decimal"
                  className="border-[#003049]/15"
                  placeholder="e.g. 4"
                  value={featMinRating}
                  onChange={(e) => setFeatMinRating(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Uses <code className="text-xs">reviews_of_experts</code>; experts with no reviews are excluded when set.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-[#003049]/10 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-[#F77F00]" />
              <CardTitle className="text-lg text-[#003049]">Categories</CardTitle>
            </div>
            <CardDescription>
              Public list uses <code className="text-xs">GET /api/categories</code> (active only).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Button
              type="button"
              variant="outline"
              className="border-[#003049]/20 text-[#003049]"
              onClick={() => void loadCategories()}
              disabled={catLoading}
            >
              {catLoading ? "Loading…" : "Load categories"}
            </Button>
            {catErr ? <p className="text-sm text-destructive">{catErr}</p> : null}
            {catMsg ? <p className="text-sm text-emerald-600">{catMsg}</p> : null}

            <form onSubmit={(e) => void onCreateCategory(e)} className="space-y-4 rounded-lg border border-[#003049]/10 bg-gray-50/50 p-4">
              <h3 className="font-medium text-[#003049]">New category</h3>
              <div className="space-y-2">
                <Label htmlFor="new-cat-name">Name (unique)</Label>
                <Input
                  id="new-cat-name"
                  required
                  className="border-[#003049]/15"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-cat-icon">Icon (optional)</Label>
                <Input
                  id="new-cat-icon"
                  className="border-[#003049]/15"
                  value={newCatIcon}
                  onChange={(e) => setNewCatIcon(e.target.value)}
                  placeholder="Emoji or short text"
                />
              </div>
              <Button type="submit" className="bg-[#003049] text-white hover:bg-[#003049]/90">
                Create
              </Button>
            </form>

            <Separator className="bg-[#003049]/10" />

            <ul className="space-y-2">
              {categories.map((c) => (
                <li
                  key={c.category_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#003049]/10 bg-white px-4 py-3 text-sm"
                >
                  <span className="text-[#003049]">
                    {c.icon ? <span className="mr-2">{c.icon}</span> : null}
                    <span className="font-medium">{c.name}</span>
                    <span
                      className={`ml-2 text-xs ${c.is_active ? "text-emerald-600" : "text-muted-foreground"}`}
                    >
                      {c.is_active ? "active" : "inactive"}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-[#F77F00] hover:bg-[#F77F00]/10 hover:text-[#F77F00]"
                    onClick={() => void toggleCategoryActive(c)}
                  >
                    {c.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

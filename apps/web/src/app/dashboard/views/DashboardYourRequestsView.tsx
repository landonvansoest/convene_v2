"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, ClipboardList } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  DashboardViewHeader,
  dashboardTabPillClass,
  dashboardViewCardClass,
  dashboardViewContentBoxClass,
} from "@/app/dashboard/DashboardViewShell";
import { PostRequestDialog } from "@/components/requests/PostRequestDialog";
import { OnlineDot } from "@/components/presence/OnlineDot";
import { VisibleTempDot } from "@/components/presence/VisibleTempDot";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type RequestRow = {
  request_id: string;
  title: string;
  description: string;
  category_id: string | null;
  skills: string[];
  response_count: number;
  created_at: string;
  is_active: boolean;
  is_public: boolean;
};

type ExpertSnippet = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  profile_photo: string | null;
  online?: boolean | null;
  available_now?: boolean | null;
  expert_visibility_state?: string | null;
};

type ResponseRow = {
  response_id: string;
  expert_user_id: string;
  message: string;
  responded_at: string;
  expert: ExpertSnippet | null;
};

type RecExpert = {
  id: string;
  name: string;
  profile_photo: string | null;
  rating: number | null;
  professional_title: string;
  expert_visibility_state?: string | null;
};

function formatPostedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function expertName(expert: ExpertSnippet | null) {
  if (!expert) return "Expert";
  const n = `${expert.first_name ?? ""} ${expert.last_name ?? ""}`.trim();
  return n || "Expert";
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${p[0]![0] ?? ""}${p[1]![0] ?? ""}`.toUpperCase();
  return (p[0]?.slice(0, 2) ?? "?").toUpperCase();
}

export function DashboardYourRequestsView() {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [postOpen, setPostOpen] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<RequestRow | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [recommended, setRecommended] = useState<RecExpert[]>([]);
  const [expandLoading, setExpandLoading] = useState(false);
  const [expandErr, setExpandErr] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ tab: tab === "archived" ? "archived" : "active" });
    const res = await fetch(`/api/me/requests?${params}`);
    const data = await res.json();
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Failed to load requests");
      setRequests([]);
      return;
    }
    setErr(null);
    setRequests((data.requests as RequestRow[]) ?? []);
  }, [tab]);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      await loadList();
      if (!c) setLoading(false);
    })();
    return () => {
      c = true;
    };
  }, [loadList]);

  useEffect(() => {
    setExpandedId(null);
    setExpandedDetail(null);
    setResponses([]);
    setRecommended([]);
    setExpandErr(null);
  }, [tab]);

  const loadExpanded = useCallback(async (id: string) => {
    setExpandLoading(true);
    setExpandErr(null);
    setExpandedDetail(null);
    setResponses([]);
    setRecommended([]);
    try {
      const [rRes, sRes] = await Promise.all([
        fetch(`/api/requests/${encodeURIComponent(id)}`),
        fetch(`/api/requests/${encodeURIComponent(id)}/responses`),
      ]);
      const rJson = await rRes.json();
      const sJson = await sRes.json();
      if (!rRes.ok) {
        setExpandErr(typeof rJson.error === "string" ? rJson.error : "Could not load request");
        setExpandedDetail(null);
        setResponses([]);
        setRecommended([]);
        return;
      }
      const req = rJson.request as RequestRow;
      setExpandedDetail(req);
      setResponses(sRes.ok ? ((sJson.responses as ResponseRow[]) ?? []) : []);

      const cat = req.category_id?.trim();
      const exUrl = cat
        ? `/api/experts?category=${encodeURIComponent(cat)}&limit=8`
        : `/api/experts?limit=8`;
      const exRes = await fetch(exUrl);
      const exJson = await exRes.json();
      if (exRes.ok) {
        setRecommended(((exJson.experts as RecExpert[]) ?? []).slice(0, 8));
      } else {
        setRecommended([]);
      }
    } finally {
      setExpandLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!expandedId) {
      setExpandedDetail(null);
      setResponses([]);
      setRecommended([]);
      return;
    }
    void loadExpanded(expandedId);
  }, [expandedId, loadExpanded]);

  function toggleRow(requestId: string) {
    setExpandedId((prev) => (prev === requestId ? null : requestId));
  }

  async function patchActive(requestId: string, is_active: boolean) {
    setBusyRequestId(requestId);
    try {
      const res = await fetch(`/api/requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(typeof data.error === "string" ? data.error : "Update failed");
        return;
      }
      if (expandedId === requestId) {
        setExpandedId(null);
      }
      await loadList();
    } finally {
      setBusyRequestId(null);
    }
  }

  return (
    <div className={dashboardViewCardClass}>
      <DashboardViewHeader
        Icon={ClipboardList}
        title="Your Requests"
        subtitle="Post to the community board, review expert responses, and archive when you are done."
        actions={
          <Button
            type="button"
            className="bg-[#F77F00] font-semibold text-white hover:bg-[#F77F00]/90"
            onClick={() => setPostOpen(true)}
          >
            Post a new request
          </Button>
        }
      />

      <PostRequestDialog
        open={postOpen}
        onOpenChange={setPostOpen}
        onPosted={() => void loadList()}
      />

      <div className="mt-8 inline-flex rounded-lg border border-[#003049]/15 bg-white p-1">
        <button type="button" className={dashboardTabPillClass(tab === "active")} onClick={() => setTab("active")}>
          Active
        </button>
        <button
          type="button"
          className={dashboardTabPillClass(tab === "archived")}
          onClick={() => setTab("archived")}
        >
          Archived
        </button>
      </div>

      {err ? <p className="mt-5 text-sm text-destructive">{err}</p> : null}

      <section className={dashboardViewContentBoxClass}>
        {loading ? (
          <p className="text-sm font-medium text-[#003049]/60">Loading…</p>
        ) : requests.length === 0 ? (
          <div className="py-6 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-[#003049]/25" strokeWidth={1.5} aria-hidden />
            <p className="mt-2 text-sm font-medium text-[#003049]/60">
              {tab === "active" ? "No active requests yet." : "No archived requests."}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {requests.map((r) => {
              const open = expandedId === r.request_id;
              return (
                <li
                  key={r.request_id}
                  className="overflow-hidden rounded-lg border border-[#003049]/10 bg-[#F8FAFC] shadow-sm"
                >
                  <div
                    className="flex cursor-pointer flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleRow(r.request_id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleRow(r.request_id);
                      }
                    }}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="mt-0.5 shrink-0 text-[#003049]/50" aria-hidden>
                        {open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-[#003049]">{r.title}</p>
                        <p className="mt-1 text-xs font-medium text-[#003049]/55">{formatPostedAt(r.created_at)}</p>
                      </div>
                    </div>
                    <div
                      className="flex shrink-0 flex-wrap items-center gap-3 sm:gap-4"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Badge variant="secondary" className="font-semibold text-white">
                        {r.response_count} expert response{r.response_count === 1 ? "" : "s"}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`active-${r.request_id}`} className="text-xs font-medium text-[#003049]/70">
                          Active
                        </Label>
                        <Switch
                          id={`active-${r.request_id}`}
                          checked={r.is_active}
                          disabled={busyRequestId === r.request_id}
                          onCheckedChange={(checked) => void patchActive(r.request_id, checked)}
                        />
                      </div>
                    </div>
                  </div>

                  {open ? (
                    <div className="border-t border-[#003049]/10 bg-white px-4 py-5 sm:px-5">
                      {expandLoading ? (
                        <p className="text-sm text-[#003049]/60">Loading details…</p>
                      ) : expandErr ? (
                        <p className="text-sm text-destructive">{expandErr}</p>
                      ) : expandedDetail ? (
                        <>
                          <p className="whitespace-pre-wrap text-sm text-[#003049]/85">{expandedDetail.description}</p>
                          <p className="mt-3 text-right">
                            <Link
                              href={`/requests/${encodeURIComponent(expandedDetail.request_id)}`}
                              className="text-xs font-semibold text-[#F77F00] underline hover:no-underline"
                            >
                              Open full page
                            </Link>
                          </p>
                          <div className="mt-6 grid gap-8 lg:grid-cols-2">
                            <div>
                              <h3 className="text-sm font-bold text-[#003049]">Expert responses</h3>
                              {responses.length === 0 ? (
                                <p className="mt-3 text-sm text-[#003049]/55">No responses yet.</p>
                              ) : (
                                <ul className="mt-3 space-y-4">
                                  {responses.map((resp) => {
                                    const name = expertName(resp.expert);
                                    return (
                                      <li
                                        key={resp.response_id}
                                        className="rounded-lg border border-[#003049]/10 bg-[#F8FAFC] p-4"
                                      >
                                        <div className="flex gap-3">
                                          <div className="relative h-11 w-11 shrink-0">
                                            <Avatar className="h-11 w-11">
                                              {resp.expert?.profile_photo ? (
                                                <AvatarImage src={resp.expert.profile_photo} alt="" />
                                              ) : null}
                                              <AvatarFallback className="bg-[#003049]/10 text-xs font-semibold text-[#003049]">
                                                {initials(name)}
                                              </AvatarFallback>
                                            </Avatar>
                                            <OnlineDot
                                              online={resp.expert?.online}
                                              availableNow={resp.expert?.available_now}
                                            />
                                            <VisibleTempDot
                                              expertVisibilityState={resp.expert?.expert_visibility_state}
                                            />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <Link
                                              href={`/experts/${encodeURIComponent(resp.expert_user_id)}`}
                                              className="text-sm font-semibold text-[#003049] hover:text-[#F77F00] hover:underline"
                                            >
                                              {name}
                                            </Link>
                                            <p className="mt-2 whitespace-pre-wrap text-sm text-[#003049]/80">
                                              {resp.message}
                                            </p>
                                            <p className="mt-2 text-xs text-[#003049]/45">
                                              {formatPostedAt(resp.responded_at)}
                                            </p>
                                          </div>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-[#003049]">Recommended experts</h3>
                              <p className="mt-1 text-xs text-[#003049]/55">
                                Based on your request category; book a session when you are ready.
                              </p>
                              {recommended.length === 0 ? (
                                <p className="mt-3 text-sm text-[#003049]/55">No suggestions right now.</p>
                              ) : (
                                <ul className="mt-4 space-y-3">
                                  {recommended.map((ex) => (
                                    <li key={ex.id}>
                                      <Link
                                        href={`/experts/${encodeURIComponent(ex.id)}`}
                                        className="flex items-center gap-3 rounded-lg border border-[#003049]/10 bg-[#F8FAFC] p-3 transition-colors hover:border-[#F77F00]/40"
                                      >
                                        <div className="relative h-10 w-10 shrink-0">
                                          <Avatar className="h-full w-full">
                                            {ex.profile_photo ? (
                                              <AvatarImage src={ex.profile_photo} alt="" />
                                            ) : null}
                                            <AvatarFallback className="bg-[#003049]/10 text-xs font-semibold text-[#003049]">
                                              {initials(ex.name)}
                                            </AvatarFallback>
                                          </Avatar>
                                          <VisibleTempDot expertVisibilityState={ex.expert_visibility_state} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-sm font-semibold text-[#003049]">{ex.name}</p>
                                          {ex.professional_title ? (
                                            <p className="truncate text-xs text-[#003049]/55">{ex.professional_title}</p>
                                          ) : null}
                                          {typeof ex.rating === "number" && Number.isFinite(ex.rating) ? (
                                            <p className="text-xs text-[#F77F00]">★ {ex.rating.toFixed(1)}</p>
                                          ) : null}
                                        </div>
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

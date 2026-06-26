"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, MessageSquare, Send, Triangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SendOfferDialog } from "@/components/dashboard/SendOfferDialog";
import { OnlineDot } from "@/components/presence/OnlineDot";
import { VisibleTempDot } from "@/components/presence/VisibleTempDot";
import { cn } from "@/lib/utils";

const HERO = "var(--convene-hero)";

export type RequestCardData = {
  request_id: string;
  user_id: string;
  title: string;
  description: string;
  response_count: number;
  upvote_count: number;
  i_upvoted: boolean;
  is_unseen?: boolean;
  created_at: string;
  skills: string[];
  category_id: string | null;
  is_active?: boolean;
};

type RequestResponseRow = {
  response_id: string;
  expert_user_id: string;
  message: string;
  is_public: boolean;
  responded_at: string;
  upvote_count: number;
  i_upvoted: boolean;
  can_upvote: boolean;
  expert: {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    profile_photo: string | null;
    online: boolean | null;
    available_now?: boolean | null;
    expert_visibility_state?: string | null;
  } | null;
};

type RequestPoster = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  profile_photo: string | null;
};

function firstLine(description: string | null | undefined): string {
  const trimmed = description?.trim() ?? "";
  if (!trimmed) return "";
  const lineBreak = trimmed.search(/[\r\n]/);
  return lineBreak === -1 ? trimmed : trimmed.slice(0, lineBreak);
}

function fullName(p: RequestResponseRow["expert"]): string {
  if (!p) return "Expert";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Expert";
}

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diffMs = Date.now() - t;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toLocaleDateString();
}

type Props = {
  request: RequestCardData;
  categoryName?: string | null;
  categoryIcon?: string | null;
  /**
   * Toggle upvote callback. Parent owns the optimistic update + server call so
   * the same card can render in pages that don't allow upvoting (omit to hide).
   */
  onToggleUpvote?: (requestId: string) => void | Promise<void>;
  busyUpvote?: boolean;
  /** Expert dashboard: conversation composer, send offer, and "View conversation" label. */
  expertDashboard?: boolean;
  onResponseCountChange?: (requestId: string, responseCount: number) => void;
  /** Expert dashboard For you tab: bold unread rows, hide control, mark seen on open. */
  forYouExpert?: boolean;
  onMarkSeen?: (requestId: string) => void | Promise<void>;
  onHide?: (requestId: string) => void | Promise<void>;
};

/**
 * Single community-request row, shared between `/requests` (public list) and
 * the dashboard's Community Requests view. The "View expert responses"
 * dropdown is self-contained: it lazy-fetches `/api/requests/[id]/responses`
 * the first time it opens, caches them in local state, and renders the same
 * expert + message thread in both contexts. No navigation — the card never
 * sends the user to a different page when the dropdown is used.
 */
export function RequestCard({
  request: r,
  categoryName,
  categoryIcon,
  onToggleUpvote,
  busyUpvote,
  expertDashboard = false,
  onResponseCountChange,
  forYouExpert = false,
  onMarkSeen,
  onHide,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUnseen, setIsUnseen] = useState(Boolean(r.is_unseen));
  const [responses, setResponses] = useState<RequestResponseRow[] | null>(null);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [busyResponseUpvoteId, setBusyResponseUpvoteId] = useState<string | null>(null);
  const [poster, setPoster] = useState<RequestPoster | null>(null);
  const [requestDescription, setRequestDescription] = useState("");
  const [currentExpertUserId, setCurrentExpertUserId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [makePublic, setMakePublic] = useState(true);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyErr, setReplyErr] = useState<string | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);

  useEffect(() => {
    setIsUnseen(Boolean(r.is_unseen));
  }, [r.is_unseen, r.request_id]);

  useEffect(() => {
    if (!expertDashboard) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!cancelled && res.ok && data.user?.id) {
        setCurrentExpertUserId(String(data.user.id));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expertDashboard]);

  const sortResponsesPublic = useCallback((rows: RequestResponseRow[]) => {
    return rows.slice().sort((a, b) => {
      if (b.upvote_count !== a.upvote_count) return b.upvote_count - a.upvote_count;
      return Date.parse(b.responded_at) - Date.parse(a.responded_at);
    });
  }, []);

  const sortResponsesConversation = useCallback((rows: RequestResponseRow[]) => {
    return rows.slice().sort((a, b) => Date.parse(a.responded_at) - Date.parse(b.responded_at));
  }, []);

  const sortResponses = expertDashboard ? sortResponsesConversation : sortResponsesPublic;

  const loadResponses = useCallback(async () => {
    setLoadingResponses(true);
    try {
      const res = await fetch(`/api/requests/${encodeURIComponent(r.request_id)}/responses`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) {
        const rows = (data.responses as RequestResponseRow[]) ?? [];
        setResponses(expertDashboard ? sortResponsesConversation(rows) : sortResponsesPublic(rows));
        if (data.poster) setPoster(data.poster as RequestPoster);
        if (data.request?.description) setRequestDescription(String(data.request.description));
      } else {
        setResponses([]);
      }
    } catch {
      setResponses([]);
    } finally {
      setLoadingResponses(false);
    }
  }, [expertDashboard, r.request_id, sortResponsesConversation, sortResponsesPublic]);

  async function toggleResponseUpvote(responseId: string) {
    if (busyResponseUpvoteId || !responses) return;
    const target = responses.find((row) => row.response_id === responseId);
    if (!target?.can_upvote) return;

    setBusyResponseUpvoteId(responseId);
    setResponses((prev) => {
      if (!prev) return prev;
      return sortResponses(
        prev.map((row) =>
          row.response_id === responseId
            ? {
                ...row,
                i_upvoted: !row.i_upvoted,
                upvote_count: row.upvote_count + (row.i_upvoted ? -1 : 1),
              }
            : row,
        ),
      );
    });

    try {
      const res = await fetch(`/api/request-responses/${encodeURIComponent(responseId)}/upvote`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setResponses((prev) => {
          if (!prev) return prev;
          return sortResponses(
            prev.map((row) =>
              row.response_id === responseId
                ? {
                    ...row,
                    i_upvoted: !row.i_upvoted,
                    upvote_count: row.upvote_count + (row.i_upvoted ? -1 : 1),
                  }
                : row,
            ),
          );
        });
        window.alert(typeof data.error === "string" ? data.error : "Could not upvote");
        return;
      }
      setResponses((prev) => {
        if (!prev) return prev;
        return sortResponses(
          prev.map((row) =>
            row.response_id === responseId
              ? {
                  ...row,
                  i_upvoted: !!data.upvoted,
                  upvote_count: Number(data.count ?? row.upvote_count),
                }
              : row,
          ),
        );
      });
    } finally {
      setBusyResponseUpvoteId(null);
    }
  }

  const toggleExpanded = useCallback(async () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next && forYouExpert && isUnseen && onMarkSeen) {
      setIsUnseen(false);
      void onMarkSeen(r.request_id);
    }
    if (next && responses === null) {
      await loadResponses();
    }
  }, [isOpen, responses, loadResponses, forYouExpert, isUnseen, onMarkSeen, r.request_id]);

  async function sendReply() {
    const text = replyText.trim();
    if (!text || sendingReply) return;
    setSendingReply(true);
    setReplyErr(null);
    try {
      const res = await fetch(`/api/requests/${encodeURIComponent(r.request_id)}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, is_public: makePublic }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReplyErr(typeof data.error === "string" ? data.error : "Could not send response");
        return;
      }
      setReplyText("");
      onResponseCountChange?.(r.request_id, r.response_count + 1);
      await loadResponses();
    } finally {
      setSendingReply(false);
    }
  }

  const learnerUserId = poster?.user_id ?? r.user_id;
  const requestIsActive = r.is_active !== false;
  const learnerDisplayName =
    poster != null
      ? `${poster.first_name ?? ""} ${poster.last_name ?? ""}`.trim() || "Learner"
      : "Learner";
  const posterInitials = learnerDisplayName
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <article className="overflow-hidden rounded-lg border border-[#003049]/10 bg-white transition hover:border-[#003049]/20 hover:shadow-sm">
      <div className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          {forYouExpert ? (
            <button
              type="button"
              onClick={() => void toggleExpanded()}
              className={cn(
                "min-w-0 flex-1 text-left text-[15px] text-[#003049] hover:underline",
                isUnseen ? "font-bold" : "font-semibold",
              )}
            >
              {r.title}
            </button>
          ) : (
            <h3 className="min-w-0 flex-1 text-[15px] font-semibold text-[#003049]">{r.title}</h3>
          )}
          {forYouExpert && onHide ? (
            <button
              type="button"
              className="shrink-0 text-[11px] font-medium text-[#003049]/55 underline-offset-2 hover:text-[#003049] hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                void onHide(r.request_id);
              }}
            >
              Hide
            </button>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#003049]/55">
          {categoryName ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#003049]/5 px-2 py-0.5 text-[#003049]">
              {categoryIcon ? <span aria-hidden>{categoryIcon}</span> : null}
              {categoryName}
            </span>
          ) : null}
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 font-medium",
              requestIsActive
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-900",
            )}
          >
            {requestIsActive ? "Active" : "Archived"}
          </span>
          <span>{timeAgo(r.created_at)}</span>
          {r.skills?.length ? (
            <span className="truncate text-[#003049]/55">{r.skills.slice(0, 3).join(" · ")}</span>
          ) : null}
        </div>
        {firstLine(r.description) ? (
          <p className="mt-2 line-clamp-1 text-[13px] text-[#003049]/75">{firstLine(r.description)}</p>
        ) : null}

        {/* Action row: upvote pill, then the "View expert responses" dropdown
            trigger. The dropdown toggles in place — it never navigates. */}
        <div className="mt-3 flex items-center gap-2">
          {onToggleUpvote ? (
            <button
              type="button"
              onClick={() => void onToggleUpvote(r.request_id)}
              disabled={busyUpvote}
              aria-label={r.i_upvoted ? "Remove upvote" : "Upvote"}
              aria-pressed={r.i_upvoted}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition",
                r.i_upvoted
                  ? "bg-[var(--convene-hero)]/10 text-[var(--convene-hero)]"
                  : "text-[#003049]/70 hover:bg-[#003049]/5 hover:text-[#003049]",
              )}
            >
              <Triangle
                className="h-3.5 w-3.5"
                fill={r.i_upvoted ? HERO : "none"}
                strokeWidth={r.i_upvoted ? 0 : 2}
              />
              <span>
                Upvotes <span className="tabular-nums">{r.upvote_count}</span>
              </span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-[#003049]/60">
              <Triangle className="h-3.5 w-3.5" fill="none" strokeWidth={2} />
              <span>
                Upvotes <span className="tabular-nums">{r.upvote_count}</span>
              </span>
            </span>
          )}

          <button
            type="button"
            onClick={() => void toggleExpanded()}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition",
              isOpen
                ? "bg-[#003049]/10 text-[#003049]"
                : "text-[#003049]/70 hover:bg-[#003049]/5 hover:text-[#003049]",
            )}
            aria-expanded={isOpen}
            aria-controls={`responses-${r.request_id}`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>
              {expertDashboard ? "View conversation" : "View expert responses"}{" "}
              <span className="tabular-nums">({r.response_count})</span>
            </span>
            {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {isOpen ? (
        <div
          id={`responses-${r.request_id}`}
          className="border-t border-[#003049]/10 bg-[#003049]/[0.025] px-4 py-3"
        >
          {loadingResponses ? (
            <p className="text-[11px] text-[#003049]/60">Loading conversation…</p>
          ) : expertDashboard ? (
            <div className="space-y-3">
              <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                <div className="flex items-start gap-2.5">
                  <Avatar className="h-8 w-8 shrink-0">
                    {poster?.profile_photo ? (
                      <AvatarImage src={poster.profile_photo} alt={learnerDisplayName} className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-[#003049]/15 text-[10px] font-semibold text-[#003049]">
                      {posterInitials || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm ring-1 ring-[#003049]/10">
                    <p className="text-[11px] font-semibold text-[#003049]">{learnerDisplayName}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[13px] text-[#003049]/85">
                      {requestDescription || r.description}
                    </p>
                    <p className="mt-1 text-[10px] text-[#003049]/45">{timeAgo(r.created_at)}</p>
                  </div>
                </div>

                {!responses || responses.length === 0 ? (
                  <p className="text-center text-[11px] text-[#003049]/55">No replies yet — be the first to respond.</p>
                ) : (
                  responses.map((resp) => {
                    const isMine = currentExpertUserId === resp.expert_user_id;
                    const initials = `${resp.expert?.first_name?.[0] ?? "?"}${
                      resp.expert?.last_name?.[0] ?? ""
                    }`.toUpperCase();
                    return (
                      <div
                        key={resp.response_id}
                        className={cn("flex items-start gap-2.5", isMine && "flex-row-reverse")}
                      >
                        <div className="relative h-8 w-8 shrink-0">
                          <Avatar className="h-8 w-8">
                            {resp.expert?.profile_photo ? (
                              <AvatarImage
                                src={resp.expert.profile_photo}
                                alt={fullName(resp.expert)}
                                className="object-cover"
                              />
                            ) : null}
                            <AvatarFallback className="bg-[#003049]/15 text-[10px] font-semibold text-[#003049]">
                              {initials || "?"}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div
                          className={cn(
                            "min-w-0 max-w-[85%] rounded-2xl px-3 py-2 shadow-sm",
                            isMine
                              ? "rounded-tr-sm bg-[#F77F00]/15 ring-1 ring-[#F77F00]/25"
                              : "rounded-tl-sm bg-white ring-1 ring-[#003049]/10",
                          )}
                        >
                          <div className={cn("flex flex-wrap items-baseline gap-2", isMine && "justify-end")}>
                            {!isMine ? (
                              <Link
                                href={`/experts/${encodeURIComponent(resp.expert?.user_id ?? "")}`}
                                className="text-[11px] font-semibold text-[#003049] hover:underline"
                              >
                                {fullName(resp.expert)}
                              </Link>
                            ) : (
                              <span className="text-[11px] font-semibold text-[#003049]">You</span>
                            )}
                            <span className="text-[10px] text-[#003049]/45">{timeAgo(resp.responded_at)}</span>
                            {resp.is_public === false ? (
                              <span className="rounded bg-[#003049]/8 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[#003049]/60">
                                Private
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-[13px] text-[#003049]/85">{resp.message}</p>
                          {resp.is_public && resp.can_upvote ? (
                            <div className={cn("mt-2", isMine && "text-right")}>
                              <button
                                type="button"
                                onClick={() => void toggleResponseUpvote(resp.response_id)}
                                disabled={busyResponseUpvoteId === resp.response_id}
                                aria-label={resp.i_upvoted ? "Remove upvote" : "Upvote response"}
                                aria-pressed={resp.i_upvoted}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition",
                                  resp.i_upvoted
                                    ? "bg-[var(--convene-hero)]/10 text-[var(--convene-hero)]"
                                    : "text-[#003049]/60 hover:bg-[#003049]/5 hover:text-[#003049]",
                                )}
                              >
                                <Triangle
                                  className="h-3 w-3"
                                  fill={resp.i_upvoted ? HERO : "none"}
                                  strokeWidth={resp.i_upvoted ? 0 : 2}
                                />
                                <span className="tabular-nums">{resp.upvote_count}</span>
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="rounded-xl border border-[#003049]/12 bg-white p-3">
                {requestIsActive ? (
                  <>
                <Textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write a reply to the learner…"
                  className="min-h-[72px] resize-none border-[#003049]/15 text-[13px] text-[#003049] focus-visible:ring-[#F77F00]/30"
                  disabled={sendingReply}
                />
                <div className="mt-2 flex items-start gap-2">
                  <Checkbox
                    id={`public-${r.request_id}`}
                    checked={makePublic}
                    onCheckedChange={(v) => setMakePublic(v === true)}
                    disabled={sendingReply}
                  />
                  <Label
                    htmlFor={`public-${r.request_id}`}
                    className="cursor-pointer text-xs leading-snug text-[#003049]/80"
                  >
                    Make response public (add to message board)
                  </Label>
                </div>
                {replyErr ? <p className="mt-2 text-xs text-destructive">{replyErr}</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[#003049] text-white hover:bg-[#003049]/90"
                    disabled={sendingReply || !replyText.trim()}
                    onClick={() => void sendReply()}
                  >
                    {sendingReply ? (
                      "Sending…"
                    ) : (
                      <>
                        <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        Send
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-[#003049]/20 text-[#003049]"
                    disabled={!learnerUserId}
                    onClick={() => setOfferOpen(true)}
                  >
                    Send an offer
                  </Button>
                </div>
                  </>
                ) : (
                  <p className="text-xs text-[#003049]/65">
                    This request is archived — new replies and offers are disabled.
                  </p>
                )}
              </div>
            </div>
          ) : !responses || responses.length === 0 ? (
            <p className="text-[11px] text-[#003049]/60">No expert responses yet.</p>
          ) : (
            <ul className="space-y-3">
              {responses.map((resp) => {
                const initials = `${resp.expert?.first_name?.[0] ?? "?"}${
                  resp.expert?.last_name?.[0] ?? ""
                }`.toUpperCase();
                return (
                  <li key={resp.response_id} className="flex items-start gap-3">
                    <div className="relative h-9 w-9 shrink-0">
                      <Avatar className="h-9 w-9">
                        {resp.expert?.profile_photo ? (
                          <AvatarImage
                            src={resp.expert.profile_photo}
                            alt={fullName(resp.expert)}
                            className="object-cover"
                          />
                        ) : null}
                        <AvatarFallback className="bg-[#003049]/15 text-xs font-semibold text-[#003049]">
                          {initials || "?"}
                        </AvatarFallback>
                      </Avatar>
                      {resp.expert?.online || resp.expert?.available_now ? (
                        <OnlineDot
                          online={resp.expert?.online}
                          availableNow={resp.expert?.available_now}
                        />
                      ) : null}
                      <VisibleTempDot expertVisibilityState={resp.expert?.expert_visibility_state} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <Link
                          href={`/experts/${encodeURIComponent(resp.expert?.user_id ?? "")}`}
                          className="text-[13px] font-semibold text-[#003049] hover:underline"
                        >
                          {fullName(resp.expert)}
                        </Link>
                        <span className="text-[11px] text-[#003049]/55">
                          {timeAgo(resp.responded_at)}
                        </span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-[#003049]/80">
                        {resp.message}
                      </p>
                      <div className="mt-2">
                        {resp.can_upvote ? (
                          <button
                            type="button"
                            onClick={() => void toggleResponseUpvote(resp.response_id)}
                            disabled={busyResponseUpvoteId === resp.response_id}
                            aria-label={resp.i_upvoted ? "Remove upvote" : "Upvote response"}
                            aria-pressed={resp.i_upvoted}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition",
                              resp.i_upvoted
                                ? "bg-[var(--convene-hero)]/10 text-[var(--convene-hero)]"
                                : "text-[#003049]/60 hover:bg-[#003049]/5 hover:text-[#003049]",
                            )}
                          >
                            <Triangle
                              className="h-3 w-3"
                              fill={resp.i_upvoted ? HERO : "none"}
                              strokeWidth={resp.i_upvoted ? 0 : 2}
                            />
                            <span className="tabular-nums">{resp.upvote_count}</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-[#003049]/50">
                            <Triangle className="h-3 w-3" fill="none" strokeWidth={2} />
                            <span className="tabular-nums">{resp.upvote_count}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {expertDashboard && learnerUserId ? (
        <SendOfferDialog
          open={offerOpen}
          onOpenChange={setOfferOpen}
          recipientUserId={learnerUserId}
          recipientFullName={learnerDisplayName}
          recipientFirstName={poster?.first_name}
          relatedBookingId={null}
        />
      ) : null}
    </article>
  );
}

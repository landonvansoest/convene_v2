"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ChevronDown, ChevronUp, MessageSquare, Triangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  created_at: string;
  skills: string[];
  category_id: string | null;
};

type RequestResponseRow = {
  response_id: string;
  expert_user_id: string;
  message: string;
  responded_at: string;
  upvote_count: number;
  expert: {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    profile_photo: string | null;
    online: boolean | null;
    expert_visibility_state?: string | null;
  } | null;
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
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [responses, setResponses] = useState<RequestResponseRow[] | null>(null);
  const [loadingResponses, setLoadingResponses] = useState(false);

  const toggleExpanded = useCallback(async () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next && responses === null) {
      setLoadingResponses(true);
      try {
        const res = await fetch(`/api/requests/${encodeURIComponent(r.request_id)}/responses`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (res.ok) {
          setResponses((data.responses as RequestResponseRow[]) ?? []);
        } else {
          setResponses([]);
        }
      } catch {
        setResponses([]);
      } finally {
        setLoadingResponses(false);
      }
    }
  }, [isOpen, responses, r.request_id]);

  return (
    <article className="overflow-hidden rounded-lg border border-[#003049]/10 bg-white transition hover:border-[#003049]/20 hover:shadow-sm">
      <div className="p-3 sm:p-4">
        <h3 className="text-[15px] font-semibold text-[#003049]">{r.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#003049]/55">
          {categoryName ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#003049]/5 px-2 py-0.5 text-[#003049]">
              {categoryIcon ? <span aria-hidden>{categoryIcon}</span> : null}
              {categoryName}
            </span>
          ) : null}
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
              View expert responses{" "}
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
            <p className="text-[11px] text-[#003049]/60">Loading responses…</p>
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
                      {resp.expert?.online ? <OnlineDot online={true} /> : null}
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
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </article>
  );
}

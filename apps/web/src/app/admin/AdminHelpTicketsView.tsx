"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, MailOpen, Send, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TicketStatus = "open" | "awaiting_user" | "resolved" | "closed";
type Author = "user" | "admin" | "system";

type TicketListItem = {
  ticket_id: string;
  user_id: string | null;
  submitter_email: string;
  submitter_name: string | null;
  subject: string;
  status: TicketStatus;
  last_message_preview: string | null;
  last_message_at: string | null;
  last_author: Author | null;
  assigned_admin: string | null;
  created_at: string;
  updated_at: string;
};

type ThreadMessage = {
  message_id: string;
  author: Author;
  admin_label: string | null;
  body: string;
  is_initial: boolean;
  email_sent_at: string | null;
  created_at: string;
};

type TicketDetail = {
  ticket: TicketListItem & { context?: Record<string, unknown>; resolved_at: string | null };
  messages: ThreadMessage[];
  user: {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    email_address: string | null;
    profile_photo: string | null;
  } | null;
};

const STATUS_TABS: { id: TicketStatus | "all"; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "awaiting_user", label: "Awaiting user" },
  { id: "resolved", label: "Resolved" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
];

const STATUS_BADGE: Record<TicketStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-amber-100 text-amber-900" },
  awaiting_user: { label: "Awaiting user", className: "bg-blue-100 text-blue-900" },
  resolved: { label: "Resolved", className: "bg-emerald-100 text-emerald-900" },
  closed: { label: "Closed", className: "bg-gray-200 text-gray-700" },
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function submitterLabel(t: { submitter_name: string | null; submitter_email: string }): string {
  return t.submitter_name?.trim() || t.submitter_email;
}

/** Help Tickets admin inbox. Two-pane layout: list left, thread + composer right. */
export function AdminHelpTicketsView({
  onCountsChanged,
}: {
  /** Called after any reply/status change so the parent can refresh sidebar badges. */
  onCountsChanged?: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("open");
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyNote, setReplyNote] = useState<string | null>(null);
  const [resolveOnSend, setResolveOnSend] = useState(false);

  const loadList = useCallback(
    async (status: TicketStatus | "all") => {
      setListLoading(true);
      setListError(null);
      try {
        const res = await fetch(
          `/api/admin/help-tickets?status=${encodeURIComponent(status)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (!res.ok) {
          setListError(typeof data?.error === "string" ? data.error : "Failed to load tickets.");
          setTickets([]);
        } else {
          setTickets((data.tickets ?? []) as TicketListItem[]);
        }
      } catch {
        setListError("Network error loading tickets.");
        setTickets([]);
      } finally {
        setListLoading(false);
      }
    },
    [],
  );

  const loadDetail = useCallback(async (ticketId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    setReplyError(null);
    setReplyNote(null);
    try {
      const res = await fetch(`/api/admin/help-tickets/${encodeURIComponent(ticketId)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setDetailError(typeof data?.error === "string" ? data.error : "Failed to load thread.");
        setDetail(null);
      } else {
        setDetail(data as TicketDetail);
      }
    } catch {
      setDetailError("Network error loading thread.");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList(statusFilter);
  }, [statusFilter, loadList]);

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, loadDetail]);

  const selectedSummary = useMemo(
    () => tickets.find((t) => t.ticket_id === selectedId) ?? null,
    [tickets, selectedId],
  );

  async function sendReply() {
    if (!selectedId || !replyBody.trim()) return;
    setReplySending(true);
    setReplyError(null);
    setReplyNote(null);
    try {
      const res = await fetch(
        `/api/admin/help-tickets/${encodeURIComponent(selectedId)}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: replyBody.trim(),
            resolve: resolveOnSend,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setReplyError(typeof data?.error === "string" ? data.error : "Failed to send reply.");
        return;
      }
      setReplyBody("");
      setResolveOnSend(false);
      setReplyNote(
        data?.emailed
          ? "Reply sent and emailed to the user."
          : "Reply saved. (SendGrid not configured — user was not emailed.)",
      );
      await Promise.all([loadDetail(selectedId), loadList(statusFilter)]);
      onCountsChanged?.();
    } catch {
      setReplyError("Network error sending reply.");
    } finally {
      setReplySending(false);
    }
  }

  async function setStatus(ticketId: string, status: TicketStatus) {
    try {
      const res = await fetch(`/api/admin/help-tickets/${encodeURIComponent(ticketId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDetailError(typeof data?.error === "string" ? data.error : "Failed to update status.");
        return;
      }
      await Promise.all([loadDetail(ticketId), loadList(statusFilter)]);
      onCountsChanged?.();
    } catch {
      setDetailError("Network error updating status.");
    }
  }

  return (
    <Card className="border-2 border-[#003049]/10 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-[#F77F00]" />
          <CardTitle className="text-lg text-[#003049]">Help Tickets</CardTitle>
        </div>
        <CardDescription>
          Inbound support tickets. Replies go out via email (SendGrid). Users can
          only respond in-app — they cannot reply through their email client.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 pb-3">
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.id}
              type="button"
              size="sm"
              variant={statusFilter === tab.id ? "default" : "outline"}
              className={
                statusFilter === tab.id
                  ? "bg-[#003049] text-white hover:bg-[#003049]/90"
                  : "border-[#003049]/20 text-[#003049]"
              }
              onClick={() => {
                setStatusFilter(tab.id);
                setSelectedId(null);
              }}
            >
              {tab.label}
            </Button>
          ))}
          <div className="ml-auto">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-[#003049]"
              onClick={() => void loadList(statusFilter)}
              disabled={listLoading}
            >
              {listLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refreshing…
                </>
              ) : (
                "Refresh"
              )}
            </Button>
          </div>
        </div>

        {listError ? <p className="pb-2 text-sm text-destructive">{listError}</p> : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
          {/* List pane */}
          <div className="overflow-hidden rounded-lg border border-[#003049]/10">
            {tickets.length === 0 && !listLoading ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {statusFilter === "open"
                  ? "Inbox is clear. New tickets will appear here."
                  : "No tickets in this view."}
              </p>
            ) : (
              <ul className="divide-y divide-[#003049]/10">
                {tickets.map((t) => {
                  const selected = t.ticket_id === selectedId;
                  const badge = STATUS_BADGE[t.status];
                  return (
                    <li key={t.ticket_id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(t.ticket_id)}
                        className={`flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors hover:bg-[#003049]/5 ${
                          selected ? "bg-[#003049]/5" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="line-clamp-1 text-sm font-medium text-[#003049]">
                            {t.subject}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">{submitterLabel(t)}</span>
                        {t.last_message_preview ? (
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {t.last_author === "admin" ? "You: " : ""}
                            {t.last_message_preview}
                          </span>
                        ) : null}
                        <span className="text-[10px] text-muted-foreground">
                          {formatDateTime(t.last_message_at ?? t.created_at)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Thread pane */}
          <div className="rounded-lg border border-[#003049]/10 p-3">
            {!selectedId ? (
              <div className="flex h-full min-h-[260px] items-center justify-center text-sm text-muted-foreground">
                <MailOpen className="mr-2 h-4 w-4" />
                Select a ticket to view the conversation.
              </div>
            ) : detailLoading ? (
              <div className="flex h-full min-h-[260px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading thread…
              </div>
            ) : detailError ? (
              <p className="text-sm text-destructive">{detailError}</p>
            ) : detail ? (
              <div className="flex flex-col gap-3">
                <header className="flex flex-wrap items-start justify-between gap-2 border-b border-[#003049]/10 pb-3">
                  <div>
                    <h3 className="text-base font-semibold text-[#003049]">
                      {detail.ticket.subject}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      From{" "}
                      <span className="font-medium text-foreground">
                        {submitterLabel(detail.ticket)}
                      </span>{" "}
                      · {detail.ticket.submitter_email}
                      {detail.user?.user_id ? " · registered user" : " · guest"} · opened{" "}
                      {formatDateTime(detail.ticket.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE[detail.ticket.status].className}`}
                    >
                      {STATUS_BADGE[detail.ticket.status].label}
                    </span>
                    {detail.ticket.status !== "resolved" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        onClick={() => void setStatus(detail.ticket.ticket_id, "resolved")}
                      >
                        <CheckCircle2 className="mr-1 h-4 w-4" />
                        Mark resolved
                      </Button>
                    ) : null}
                    {detail.ticket.status !== "closed" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => void setStatus(detail.ticket.ticket_id, "closed")}
                      >
                        Close
                      </Button>
                    ) : null}
                    {detail.ticket.status === "resolved" || detail.ticket.status === "closed" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-[#003049]/20 text-[#003049]"
                        onClick={() => void setStatus(detail.ticket.ticket_id, "open")}
                      >
                        Reopen
                      </Button>
                    ) : null}
                  </div>
                </header>

                <ol className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
                  {detail.messages.map((m) => {
                    const fromAdmin = m.author === "admin";
                    const fromSystem = m.author === "system";
                    return (
                      <li
                        key={m.message_id}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          fromAdmin
                            ? "border-[#003049]/15 bg-[#003049]/5"
                            : fromSystem
                              ? "border-dashed border-muted-foreground/30 bg-muted/40 italic text-muted-foreground"
                              : "border-amber-200/60 bg-amber-50/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          <span>
                            {fromAdmin
                              ? `Convene${m.admin_label ? ` · ${m.admin_label}` : ""}`
                              : fromSystem
                                ? "System"
                                : `User${m.is_initial ? " · opened ticket" : ""}`}
                          </span>
                          <span>{formatDateTime(m.created_at)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-foreground">{m.body}</p>
                        {fromAdmin && m.email_sent_at ? (
                          <p className="pt-1 text-[10px] text-muted-foreground">
                            Emailed at {formatDateTime(m.email_sent_at)}.
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>

                <div className="rounded-lg border border-[#003049]/10 p-3">
                  <Label htmlFor="help-ticket-reply" className="text-xs uppercase text-muted-foreground">
                    Your reply (sent by email to {detail.ticket.submitter_email})
                  </Label>
                  <Textarea
                    id="help-ticket-reply"
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Write a response…"
                    rows={5}
                    className="mt-1 resize-y"
                    disabled={
                      replySending ||
                      detail.ticket.status === "closed" ||
                      detail.ticket.status === "resolved"
                    }
                  />
                  {detail.ticket.status === "closed" || detail.ticket.status === "resolved" ? (
                    <p className="pt-2 text-xs text-muted-foreground">
                      Reopen the ticket to send a new reply.
                    </p>
                  ) : null}
                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={resolveOnSend}
                        onChange={(e) => setResolveOnSend(e.target.checked)}
                        disabled={replySending}
                      />
                      Mark resolved after sending
                    </label>
                    <Button
                      type="button"
                      onClick={() => void sendReply()}
                      disabled={
                        replySending ||
                        !replyBody.trim() ||
                        detail.ticket.status === "closed" ||
                        detail.ticket.status === "resolved"
                      }
                      className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                    >
                      {replySending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" /> Send reply
                        </>
                      )}
                    </Button>
                  </div>
                  {replyError ? (
                    <p className="pt-2 text-sm text-destructive">{replyError}</p>
                  ) : null}
                  {replyNote ? (
                    <p className="pt-2 text-xs text-emerald-700">{replyNote}</p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Pick a ticket from the list.</p>
            )}
          </div>
        </div>

        {selectedSummary ? null : null}
      </CardContent>
    </Card>
  );
}

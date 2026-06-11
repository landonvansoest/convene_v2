"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Author = "user" | "admin" | "system";

type ThreadMessage = {
  message_id: string;
  author: Author;
  admin_label: string | null;
  body: string;
  is_initial: boolean;
  created_at: string;
};

type Ticket = {
  ticket_id: string;
  subject: string;
  status: "open" | "awaiting_user" | "resolved" | "closed";
  submitter_email: string;
  submitter_name: string | null;
  created_at: string;
  updated_at: string;
};

function formatDateTime(iso: string): string {
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

const STATUS_LABEL: Record<Ticket["status"], string> = {
  open: "Open — waiting on Convene",
  awaiting_user: "Awaiting your reply",
  resolved: "Resolved",
  closed: "Closed",
};

/**
 * User-side help-ticket thread. Accessed via the CTA in the email Convene
 * sends when an admin replies. Auth-gated: only the original submitter can
 * view their thread.
 */
export default function HelpTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = use(params);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsSignIn(false);
    try {
      const res = await fetch(`/api/help-tickets/${encodeURIComponent(ticketId)}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        setNeedsSignIn(true);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Failed to load ticket.");
        return;
      }
      setTicket(data.ticket as Ticket);
      setMessages((data.messages ?? []) as ThreadMessage[]);
    } catch {
      setError("Network error loading your ticket.");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    if (!replyBody.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(
        `/api/help-tickets/${encodeURIComponent(ticketId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: replyBody.trim() }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(typeof data?.error === "string" ? data.error : "Failed to send reply.");
        return;
      }
      setReplyBody("");
      await load();
    } catch {
      setSendError("Network error sending reply.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="px-2 text-muted-foreground">
          <Link href="/">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Convene
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {loading ? "Loading…" : ticket?.subject ?? "Help ticket"}
          </CardTitle>
          {ticket ? (
            <p className="text-xs text-muted-foreground">
              Status:{" "}
              <span className="font-medium text-foreground">
                {STATUS_LABEL[ticket.status]}
              </span>{" "}
              · Opened {formatDateTime(ticket.created_at)}
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…
            </div>
          ) : needsSignIn ? (
            <div className="space-y-3 py-2 text-sm">
              <p>
                Please sign in to view this ticket. (If you submitted it as a guest,
                use the same email address.)
              </p>
              <Button asChild className="bg-convene-primary text-white hover:bg-convene-primary/90">
                <Link href={`/login?redirect=${encodeURIComponent(`/help/${ticketId}`)}`}>
                  Sign in
                </Link>
              </Button>
            </div>
          ) : error ? (
            <p className="py-2 text-sm text-destructive">{error}</p>
          ) : ticket ? (
            <div className="space-y-4">
              <ol className="flex flex-col gap-3">
                {messages.map((m) => {
                  const fromAdmin = m.author === "admin";
                  const fromSystem = m.author === "system";
                  return (
                    <li
                      key={m.message_id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        fromAdmin
                          ? "border-convene-primary/15 bg-convene-primary/5"
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
                              : `You${m.is_initial ? " · opened this ticket" : ""}`}
                        </span>
                        <span>{formatDateTime(m.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-foreground">{m.body}</p>
                    </li>
                  );
                })}
              </ol>

              {ticket.status === "closed" || ticket.status === "resolved" ? (
                <p className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  This ticket is {ticket.status}. If you still need help, please{" "}
                  <Link href="/" className="underline">
                    open a new ticket
                  </Link>
                  .
                </p>
              ) : (
                <div className="rounded-lg border p-3">
                  <Label htmlFor="user-reply" className="text-xs uppercase text-muted-foreground">
                    Add a reply
                  </Label>
                  <Textarea
                    id="user-reply"
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Write your reply…"
                    rows={5}
                    className="mt-1 resize-y"
                    disabled={sending}
                    maxLength={8000}
                  />
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-[11px] text-muted-foreground">
                      Replies happen here — emails sent from Convene are not monitored.
                    </p>
                    <Button
                      type="button"
                      onClick={() => void send()}
                      disabled={!replyBody.trim() || sending}
                      className="bg-convene-primary text-white hover:bg-convene-primary/90"
                    >
                      {sending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" /> Send
                        </>
                      )}
                    </Button>
                  </div>
                  {sendError ? (
                    <p className="pt-2 text-sm text-destructive">{sendError}</p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

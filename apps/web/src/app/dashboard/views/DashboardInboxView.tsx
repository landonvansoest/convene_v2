"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mail, MessageSquare, RefreshCw } from "lucide-react";
import {
  dashboardInputClass,
  dashboardViewCardClass,
  dashboardViewContentBoxClass,
  DashboardViewHeader,
} from "@/app/dashboard/DashboardViewShell";
import { LEARNER_TOUR_EINSTEIN_PHOTO } from "@/lib/tour/learner-tour-demo-booking";
import { formatChatMessageDate } from "@/lib/messages/formatMessageDate";
import { EXPERT_TOUR_INBOX_DEMO_PARTNER_ID } from "@/lib/tour/expert-tour-demo-booking";
import { dispatchInboxUnreadMayHaveChanged } from "@/lib/messages/inbox-unread-events";
import { cn } from "@/lib/utils";
import { RescheduleOfferMessageActions } from "@/components/messages/RescheduleOfferMessageActions";
import { OfferMessageBody } from "@/components/messages/OfferMessageBody";
import { MessageBodyText } from "@/components/messages/MessageBodyText";
import { SendOfferDialog } from "@/components/dashboard/SendOfferDialog";
import { SessionPaymentDialog } from "@/components/dashboard/SessionPaymentDialog";
import { VisibleTempDot } from "@/components/presence/VisibleTempDot";

type Conv = {
  partner_id: string;
  partner_name?: string | null;
  partner_photo?: string | null;
  partner_online?: boolean | null;
  partner_expert_visibility_state?: string | null;
  last_message?: string | null;
  last_message_time?: string | null;
  unread_count?: number;
  tour_partner_profession?: string | null;
};

export type InboxTourDemoProps = {
  active: boolean;
  highlightSuggest: boolean;
};

type Msg = {
  id: string;
  sender_id: string;
  message_body: string;
  created_at?: string;
  is_read?: boolean;
  offer_id?: string | null;
  offer_type?: string | null;
  offer_status?: string | null;
  offer_payload?: Record<string, unknown> | null;
  companion_message?: string | null;
  sender_name?: string | null;
};

export default function DashboardInboxView({ tourDemo = null }: { tourDemo?: InboxTourDemoProps | null }) {
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [unreadTotal, setUnreadTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [threadErr, setThreadErr] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [hasExpertProfile, setHasExpertProfile] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [payBookingId, setPayBookingId] = useState<string | null>(null);
  const inboxComposerRef = useRef<HTMLInputElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);

  const scrollThreadToAnchor = useCallback((msgs: Msg[], viewerId: string | null) => {
    const container = threadScrollRef.current;
    if (!container || msgs.length === 0) return;

    let anchorId = msgs[msgs.length - 1].id;
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const m = msgs[i];
      if (viewerId && m.sender_id !== viewerId && m.is_read === false) {
        anchorId = m.id;
        break;
      }
    }

    const scroll = () => {
      const node = container.querySelector(`[data-message-id="${anchorId}"]`);
      if (node instanceof HTMLElement) {
        node.scrollIntoView({ block: "end", behavior: "auto" });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(scroll));
  }, []);

  const loadLists = useCallback(async () => {
    setError(null);
    /** One round-trip: `/conversations` already has per-row `unread_count` (RPC + join).
     * The separate `/unread/count` call duplicated a full `conversations` + `messages` count query on the server. */
    const cRes = await fetch("/api/messages/conversations");
    const cData = await cRes.json();
    if (!cRes.ok) {
      setError(typeof cData.error === "string" ? cData.error : "Failed to load");
      setConversations([]);
      setUnreadTotal(null);
    } else {
      const list = (cData.conversations as Conv[]) ?? [];
      setConversations(list);
      const total = list.reduce(
        (s, c) => s + (typeof c.unread_count === "number" ? c.unread_count : 0),
        0,
      );
      setUnreadTotal(total);
    }
    dispatchInboxUnreadMayHaveChanged();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      /** Don’t block the inbox list on welcome DM setup (same work may run in dashboard RSC / ensure route).
       * Awaiting it here made the UI wait on extra DB + conversation creation on first visit. */
      void fetch("/api/me/ensure-welcome-inbox", { method: "POST", credentials: "include" }).catch(() => {
        /* non-fatal */
      });
      await loadLists();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLists]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/me");
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as {
        user?: { id?: string } | null;
        profile?: { has_expert_profile?: boolean } | null;
      };
      if (!cancelled) {
        setMeId(data.user?.id ?? null);
        setHasExpertProfile(Boolean(data.profile?.has_expert_profile));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadThread = useCallback(
    async (partnerId: string) => {
      setThreadErr(null);
      setThreadLoading(true);
      const res = await fetch(`/api/messages/conversation/${encodeURIComponent(partnerId)}`);
      const data = await res.json();
      setThreadLoading(false);
      if (!res.ok) {
        setThreadErr(typeof data.error === "string" ? data.error : "Failed to load thread");
        setMessages([]);
        return;
      }
      setMessages((data.messages as Msg[]) ?? []);
      await loadLists();
    },
    [loadLists]
  );

  const inboxTourDemoConv = useMemo(
    (): Conv => ({
      partner_id: EXPERT_TOUR_INBOX_DEMO_PARTNER_ID,
      partner_name: "Albert Einstein",
      partner_photo: LEARNER_TOUR_EINSTEIN_PHOTO,
      last_message: "Looking forward to our session.",
      last_message_time: "Now",
      unread_count: 1,
      tour_partner_profession: "Theoretical Physicist & Nobel Prize Winner",
    }),
    [],
  );

  const displayConversations = useMemo(() => {
    if (!tourDemo?.active) return conversations;
    const rest = conversations.filter((c) => c.partner_id !== EXPERT_TOUR_INBOX_DEMO_PARTNER_ID);
    return [inboxTourDemoConv, ...rest];
  }, [tourDemo?.active, conversations, inboxTourDemoConv]);

  useEffect(() => {
    if (tourDemo?.active) {
      setSelectedId(EXPERT_TOUR_INBOX_DEMO_PARTNER_ID);
      return;
    }
    setSelectedId((id) => (id === EXPERT_TOUR_INBOX_DEMO_PARTNER_ID ? null : id));
  }, [tourDemo?.active]);

  const tourDemoMessages = useMemo((): Msg[] => {
    if (!meId) {
      return [
        {
          id: "tour-m1",
          sender_id: EXPERT_TOUR_INBOX_DEMO_PARTNER_ID,
          message_body: "Hello — I’m looking forward to learning with you.",
          created_at: "Just now",
        },
      ];
    }
    return [
      {
        id: "tour-m1",
        sender_id: EXPERT_TOUR_INBOX_DEMO_PARTNER_ID,
        message_body: "Hello — I’m looking forward to learning with you.",
        created_at: "Just now",
      },
      {
        id: "tour-m2",
        sender_id: meId,
        message_body: "Hi Albert — glad to have you on Convene.",
        created_at: "Just now",
      },
    ];
  }, [meId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    if (selectedId === EXPERT_TOUR_INBOX_DEMO_PARTNER_ID) {
      setThreadLoading(false);
      setThreadErr(null);
      setMessages(tourDemoMessages);
      return;
    }
    void loadThread(selectedId);
  }, [selectedId, loadThread, tourDemoMessages]);

  useEffect(() => {
    if (threadLoading || !selectedId || messages.length === 0) return;
    scrollThreadToAnchor(messages, meId);
  }, [messages, threadLoading, selectedId, meId, scrollThreadToAnchor]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return displayConversations;
    return displayConversations.filter((c) => {
      const name = (c.partner_name || c.partner_id).toLowerCase();
      const last = (c.last_message || "").toLowerCase();
      return name.includes(q) || last.includes(q);
    });
  }, [displayConversations, search]);

  const selected = useMemo(
    () => displayConversations.find((c) => c.partner_id === selectedId) ?? null,
    [displayConversations, selectedId],
  );

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (selectedId === EXPERT_TOUR_INBOX_DEMO_PARTNER_ID) return;
    if (!selectedId || !body.trim()) return;
    setSending(true);
    setThreadErr(null);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId: selectedId, messageBody: body.trim() }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      setThreadErr(typeof data.error === "string" ? data.error : "Send failed");
      return;
    }
    setBody("");
    await loadThread(selectedId);
  }

  async function onRefresh() {
    await loadLists();
    if (selectedId === EXPERT_TOUR_INBOX_DEMO_PARTNER_ID) {
      setMessages(tourDemoMessages);
      return;
    }
    if (selectedId) await loadThread(selectedId);
  }

  return (
    <div className={dashboardViewCardClass}>
      <DashboardViewHeader
        Icon={Mail}
        title="Inbox"
        subtitle={
          unreadTotal != null ? `${unreadTotal} unread conversation${unreadTotal === 1 ? "" : "s"}` : "Messages with experts and learners"
        }
      />
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className={`${dashboardViewContentBoxClass} overflow-hidden p-0`}>
      <div className="grid min-h-[420px] lg:h-[min(70vh,640px)] lg:max-h-[min(70vh,640px)] lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="max-h-[45vh] overflow-y-auto border-b border-[#003049]/10 lg:max-h-none lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="border-b border-[#003049]/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[1.85rem] font-bold leading-none text-[#003049]">Messages</h2>
              <button
                type="button"
                aria-label="Refresh messages"
                onClick={() => void onRefresh()}
                className="rounded-md p-2 text-[#003049] transition hover:bg-[#003049]/5"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <label className="mt-4 block">
              <span className="sr-only">Search conversations</span>
              <input
                className={dashboardInputClass}
                placeholder="Search conversations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading</p>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center">
              <MessageSquare className="mx-auto h-10 w-10 text-[#003049]/25" strokeWidth={1.5} aria-hidden />
              <p className="mt-2 text-sm text-muted-foreground">No conversations match.</p>
            </div>
          ) : (
            <ul>
              {filtered.map((c) => {
                const active = c.partner_id === selectedId;
                const hasUnread = Boolean(c.unread_count && c.unread_count > 0);
                const listTime =
                  c.last_message_time != null && c.last_message_time !== ""
                    ? formatChatMessageDate(c.last_message_time)
                    : "";
                return (
                  <li key={c.partner_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.partner_id)}
                      aria-label={
                        hasUnread && typeof c.unread_count === "number"
                          ? `${c.partner_name?.trim() || "Conversation"}, ${c.unread_count} unread message${c.unread_count === 1 ? "" : "s"}`
                          : undefined
                      }
                      className={`flex w-full gap-3 border-b border-[#003049]/5 px-4 py-3 text-left transition hover:bg-gray-50 ${
                        active ? "bg-[#F77F00]/10" : ""
                      }`}
                    >
                      <div className="relative h-10 w-10 shrink-0 rounded-full border border-[#003049]/10 bg-white">
                        <div className="relative h-full w-full overflow-hidden rounded-full">
                          {c.partner_photo ? (
                            <Image
                              src={c.partner_photo}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="40px"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[#003049]/35">
                              {(c.partner_name || c.partner_id).slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <VisibleTempDot expertVisibilityState={c.partner_expert_visibility_state} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex flex-1 items-center gap-2">
                            <span
                              className={cn(
                                "truncate text-[#003049]",
                                hasUnread ? "font-bold" : "font-medium",
                              )}
                            >
                              {c.partner_name?.trim() || `${c.partner_id.slice(0, 8)}…`}
                            </span>
                          </div>
                          {listTime ? (
                            <time
                              dateTime={c.last_message_time ?? undefined}
                              className={cn(
                                "shrink-0 pt-0.5 text-xs tabular-nums",
                                hasUnread ? "font-semibold text-[#003049]" : "text-muted-foreground",
                              )}
                            >
                              {listTime}
                            </time>
                          ) : null}
                        </div>
                        {c.last_message ? (
                          <p
                            className={cn(
                              "mt-0.5 line-clamp-2 text-xs",
                              hasUnread ? "font-semibold text-[#003049]" : "font-normal text-muted-foreground",
                            )}
                          >
                            {c.last_message}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex min-h-[320px] max-h-[min(55vh,520px)] flex-col overflow-hidden bg-gray-50/40 lg:h-full lg:max-h-none lg:min-h-0">
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <MessageSquare className="h-12 w-12 text-[#003049]/25" strokeWidth={1.5} aria-hidden />
              <p className="mt-3 text-sm text-muted-foreground">Select a conversation to read and reply.</p>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-[#003049]/10 bg-white px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[#003049]">
                    {selected?.partner_name?.trim() || `${selectedId.slice(0, 8)}…`}
                  </p>
                  {selected?.tour_partner_profession ? (
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                      {selected.tour_partner_profession}
                    </p>
                  ) : null}
                </div>
              </div>
              {threadErr ? <p className="shrink-0 px-4 py-2 text-sm text-red-600">{threadErr}</p> : null}
              <div
                ref={threadScrollRef}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4"
              >
                {threadLoading ? (
                  <p className="text-sm text-muted-foreground">Loading thread</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No messages yet.</p>
                ) : (
                  messages.map((m) => {
                    const mine = Boolean(meId && m.sender_id === meId);
                    return (
                      <div
                        key={m.id}
                        data-message-id={m.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[min(100%,28rem)] rounded-2xl px-3 py-2 text-sm text-[#003049] ${
                            mine
                              ? "bg-[#F77F00]/18"
                              : "bg-[#003049]/10"
                          }`}
                        >
                          {m.created_at ? (
                            <p className="mb-1 text-[10px] text-muted-foreground">
                              {formatChatMessageDate(m.created_at)}
                            </p>
                          ) : null}
                          {m.offer_id ? (
                            <OfferMessageBody
                              offerType={m.offer_type}
                              offerPayload={m.offer_payload}
                              offerStatus={m.offer_status}
                              companionMessage={m.companion_message}
                              senderName={m.sender_name}
                              messageBody={m.message_body}
                              variant={mine ? "inbox" : "theirs"}
                            />
                          ) : (
                            <MessageBodyText
                              text={m.message_body}
                              variant={mine ? "inbox" : "theirs"}
                            />
                          )}
                          <RescheduleOfferMessageActions
                            message={m}
                            viewerUserId={meId}
                            variant={mine ? "mineMuted" : "theirs"}
                            onThreadChanged={
                              selectedId && selectedId !== EXPERT_TOUR_INBOX_DEMO_PARTNER_ID
                                ? () => void loadThread(selectedId)
                                : undefined
                            }
                            onAcceptPayment={(bookingId) => setPayBookingId(bookingId)}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <form
                onSubmit={(e) => void onSend(e)}
                className="shrink-0 border-t border-[#003049]/10 bg-white p-4"
              >
                <div className="flex gap-2">
                  <input
                    ref={inboxComposerRef}
                    className={`${dashboardInputClass} min-w-0 flex-1`}
                    placeholder="Write a message"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                  {tourDemo?.active &&
                  tourDemo.highlightSuggest &&
                  selectedId === EXPERT_TOUR_INBOX_DEMO_PARTNER_ID ? (
                    <button
                      type="button"
                      data-tour-target="tour-inbox-suggest"
                      className="shrink-0 rounded-lg border-2 border-[#F77F00] bg-white px-3 py-2 text-sm font-semibold text-[#F77F00] shadow-sm"
                      onClick={(e) => e.preventDefault()}
                    >
                      Send an Offer
                    </button>
                  ) : hasExpertProfile &&
                    selectedId &&
                    selectedId !== EXPERT_TOUR_INBOX_DEMO_PARTNER_ID ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-[#003049]/20 bg-white px-3 py-2 text-sm font-semibold text-[#003049] shadow-sm transition hover:bg-[#003049]/5"
                      onClick={() => setOfferOpen(true)}
                    >
                      Send an Offer
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    disabled={
                      sending ||
                      !body.trim() ||
                      selectedId === EXPERT_TOUR_INBOX_DEMO_PARTNER_ID
                    }
                    className="shrink-0 rounded-lg bg-[#F77F00] px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50"
                  >
                    {sending ? "Sending" : "Send"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
      </div>
      {hasExpertProfile &&
      selectedId &&
      selectedId !== EXPERT_TOUR_INBOX_DEMO_PARTNER_ID &&
      selected ? (
        <SendOfferDialog
          open={offerOpen}
          onOpenChange={setOfferOpen}
          recipientUserId={selectedId}
          recipientFullName={selected.partner_name?.trim() ?? "Conversation partner"}
          recipientFirstName={(selected.partner_name ?? "").trim().split(/\s+/)[0]}
          relatedBookingId={null}
          onSubmitted={() => {
            void loadLists();
            void loadThread(selectedId);
          }}
        />
      ) : null}
      <SessionPaymentDialog
        open={Boolean(payBookingId)}
        onOpenChange={(open) => {
          if (!open) setPayBookingId(null);
        }}
        bookingId={payBookingId ?? ""}
        onPaid={() => {
          setPayBookingId(null);
          if (selectedId) void loadThread(selectedId);
          void loadLists();
        }}
      />
    </div>
  );
}

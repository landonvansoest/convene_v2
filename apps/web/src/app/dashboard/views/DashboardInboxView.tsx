"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Conv = {
  partner_id: string;
  partner_name?: string | null;
  partner_photo?: string | null;
  last_message?: string | null;
  last_message_time?: string | null;
  unread_count?: number;
};

type Msg = {
  id: string;
  sender_id: string;
  message_body: string;
  created_at?: string;
};

export default function DashboardInboxView() {
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

  const loadLists = useCallback(async () => {
    setError(null);
    const [cRes, uRes] = await Promise.all([
      fetch("/api/messages/conversations"),
      fetch("/api/messages/unread/count"),
    ]);
    const cData = await cRes.json();
    const uData = await uRes.json();
    if (!cRes.ok) {
      setError(typeof cData.error === "string" ? cData.error : "Failed to load");
      setConversations([]);
    } else {
      setConversations((cData.conversations as Conv[]) ?? []);
    }
    if (uRes.ok && typeof uData.count === "number") {
      setUnreadTotal(uData.count);
    } else {
      setUnreadTotal(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
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
      const data = (await res.json()) as { user?: { id?: string } | null };
      if (!cancelled) setMeId(data.user?.id ?? null);
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

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadThread(selectedId);
  }, [selectedId, loadThread]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const name = (c.partner_name || c.partner_id).toLowerCase();
      const last = (c.last_message || "").toLowerCase();
      return name.includes(q) || last.includes(q);
    });
  }, [conversations, search]);

  const selected = useMemo(
    () => conversations.find((c) => c.partner_id === selectedId) ?? null,
    [conversations, selectedId]
  );

  async function onSend(e: FormEvent) {
    e.preventDefault();
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
    if (selectedId) await loadThread(selectedId);
  }

  return (
    <div className="rounded-xl border-2 border-[#003049]/10 bg-white shadow-sm">
      <div className="border-b border-[#003049]/10 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#003049]">Inbox</h2>
            {unreadTotal != null ? (
              <p className="mt-1 text-sm text-muted-foreground">{unreadTotal} unread</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="rounded-lg border border-[#003049]/15 px-3 py-1.5 text-sm font-medium text-[#003049] hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
        <label className="mt-4 block">
          <span className="sr-only">Search conversations</span>
          <input
            className="w-full rounded-lg border border-[#003049]/15 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[#F77F00] focus:ring-1 focus:ring-[#F77F00]"
            placeholder="Search by name or message"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="grid min-h-[420px] lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="max-h-[55vh] overflow-y-auto border-b border-[#003049]/10 lg:max-h-[min(70vh,640px)] lg:border-b-0 lg:border-r">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No conversations match.</p>
          ) : (
            <ul>
              {filtered.map((c) => {
                const active = c.partner_id === selectedId;
                return (
                  <li key={c.partner_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.partner_id)}
                      className={`flex w-full gap-3 border-b border-[#003049]/5 px-4 py-3 text-left transition hover:bg-gray-50 ${
                        active ? "bg-[#003049]/5" : ""
                      }`}
                    >
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#003049]/10 bg-white">
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
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-[#003049]">
                            {c.partner_name?.trim() || `${c.partner_id.slice(0, 8)}…`}
                          </span>
                          {c.unread_count ? (
                            <span className="shrink-0 rounded-full bg-[#F77F00] px-2 py-0.5 text-xs font-medium text-white">
                              {c.unread_count}
                            </span>
                          ) : null}
                        </div>
                        {c.last_message ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{c.last_message}</p>
                        ) : null}
                        {c.last_message_time ? (
                          <p className="mt-1 text-[10px] text-muted-foreground">{c.last_message_time}</p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex min-h-[320px] flex-col bg-gray-50/40 lg:min-h-[min(70vh,640px)]">
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              Select a conversation to read and reply.
            </div>
          ) : (
            <>
              <div className="border-b border-[#003049]/10 bg-white px-4 py-3">
                <p className="font-semibold text-[#003049]">
                  {selected?.partner_name?.trim() || `${selectedId.slice(0, 8)}…`}
                </p>
              </div>
              {threadErr ? <p className="px-4 py-2 text-sm text-red-600">{threadErr}</p> : null}
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {threadLoading ? (
                  <p className="text-sm text-muted-foreground">Loading thread</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No messages yet.</p>
                ) : (
                  messages.map((m) => {
                    const mine = Boolean(meId && m.sender_id === meId);
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[min(100%,28rem)] rounded-2xl px-3 py-2 text-sm ${
                            mine ? "bg-[#F77F00] text-white" : "border border-[#003049]/10 bg-white text-[#003049]"
                          }`}
                        >
                          {m.created_at ? (
                            <p className={`mb-1 text-[10px] ${mine ? "text-white/80" : "text-muted-foreground"}`}>
                              {m.created_at}
                            </p>
                          ) : null}
                          <p className="whitespace-pre-wrap">{m.message_body}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <form onSubmit={(e) => void onSend(e)} className="border-t border-[#003049]/10 bg-white p-4">
                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-[#003049]/15 px-3 py-2 text-sm outline-none focus:border-[#F77F00] focus:ring-1 focus:ring-[#F77F00]"
                    placeholder="Write a message"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={sending || !body.trim()}
                    className="shrink-0 rounded-lg bg-[#003049] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
  );
}

"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Msg = {
  id: string;
  sender_id: string;
  recipient_id: string;
  message_body: string;
  created_at?: string;
  is_read?: boolean;
};

type Conv = {
  partner_id: string;
  partner_name?: string | null;
  partner_photo?: string | null;
};

export default function MessageThreadPage() {
  const params = useParams();
  const partnerId = typeof params.partnerId === "string" ? params.partnerId : "";

  const [messages, setMessages] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [partnerMeta, setPartnerMeta] = useState<{ name: string | null; photo: string | null } | null>(null);

  const loadThread = useCallback(async () => {
    if (!partnerId) return;
    setError(null);
    const res = await fetch(`/api/messages/conversation/${encodeURIComponent(partnerId)}`);
    const data = await res.json();
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed to load thread");
      setMessages([]);
      return;
    }
    setMessages((data.messages as Msg[]) ?? []);
  }, [partnerId]);

  const resolvePartner = useCallback(async () => {
    if (!partnerId) return;
    const res = await fetch("/api/messages/conversations");
    if (!res.ok) return;
    const data = await res.json();
    const list = (data.conversations as Conv[]) ?? [];
    const hit = list.find((c) => c.partner_id === partnerId);
    if (hit) {
      setPartnerMeta({ name: hit.partner_name ?? null, photo: hit.partner_photo ?? null });
    }
  }, [partnerId]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadThread(), resolvePartner()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadThread, resolvePartner]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!partnerId || !body.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId: partnerId, messageBody: body.trim() }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Send failed");
      return;
    }
    setBody("");
    await loadThread();
  }

  const displayName =
    partnerMeta?.name?.trim() || (partnerId ? `${partnerId.slice(0, 8)}…` : "Conversation");

  if (!partnerId) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto max-w-lg rounded-xl border-2 border-[#003049]/10 bg-white p-6 shadow-sm">
          <p className="text-sm text-destructive">Invalid conversation.</p>
          <Button asChild variant="link" className="mt-2 h-auto p-0 text-[#F77F00]">
            <Link href="/messages">Back to inbox</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-foreground">
      <div className="mx-auto flex max-w-2xl flex-col px-4 py-6" style={{ minHeight: "calc(100vh - 2rem)" }}>
        <Link
          href="/messages"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-[#003049] hover:text-[#F77F00]"
        >
          <ChevronLeft className="h-4 w-4" />
          Inbox
        </Link>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-2 border-[#003049]/10 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-[#003049]/10 px-4 py-3">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#003049]/10 bg-gray-50">
              {partnerMeta?.photo ? (
                <Image
                  src={partnerMeta.photo}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="40px"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[#003049]/35">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-semibold text-[#003049]">{displayName}</h1>
              <p className="truncate font-mono text-[10px] text-muted-foreground">{partnerId}</p>
            </div>
          </div>

          {error ? <p className="px-4 py-2 text-sm text-destructive">{error}</p> : null}

          <div className="min-h-[240px] flex-1 space-y-3 overflow-y-auto bg-gray-50/50 p-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet. Say hello below.</p>
            ) : (
              messages.map((m) => {
                const mine = Boolean(meId && m.sender_id === meId);
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[min(100%,20rem)] rounded-2xl px-3 py-2 text-sm ${
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
              <Input
                className="min-w-0 flex-1 border-[#003049]/15 focus-visible:ring-[#F77F00]"
                placeholder="Write a message…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <Button
                type="submit"
                disabled={sending || !body.trim()}
                className="shrink-0 bg-[#003049] text-white hover:bg-[#003049]/90"
              >
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

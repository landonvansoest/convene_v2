"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Conv = {
  partner_id: string;
  partner_name?: string | null;
  partner_photo?: string | null;
  last_message?: string | null;
  last_message_time?: string | null;
  unread_count?: number;
};

export default function MessagesInboxPage() {
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [unreadTotal, setUnreadTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
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
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const name = (c.partner_name || c.partner_id).toLowerCase();
      const last = (c.last_message || "").toLowerCase();
      return name.includes(q) || last.includes(q);
    });
  }, [conversations, search]);

  return (
    <div className="min-h-screen bg-gray-50 text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/dashboard?view=inbox"
            className="inline-flex items-center gap-1 text-sm font-medium text-[#003049] hover:text-[#F77F00]"
          >
            <ChevronLeft className="h-4 w-4" />
            Dashboard inbox
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#003049]/20 text-[#003049]"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="rounded-xl border-2 border-[#003049]/10 bg-white shadow-sm">
          <div className="border-b border-[#003049]/10 p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#003049]/10 text-[#003049]">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-[#003049]">Messages</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {unreadTotal != null ? (
                    <>
                      <span className="font-medium text-[#F77F00]">{unreadTotal}</span> unread
                    </>
                  ) : (
                    "Your conversations"
                  )}
                </p>
              </div>
            </div>
            <label className="mt-4 block">
              <span className="sr-only">Search</span>
              <Input
                className="border-[#003049]/15 bg-gray-50/80 focus-visible:ring-[#F77F00]"
                placeholder="Search by name or message"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {error ? (
              <p className="mt-3 text-sm text-destructive">
                {error}{" "}
                <Link href="/login" className="font-medium text-[#F77F00] underline underline-offset-2">
                  Sign in
                </Link>
              </p>
            ) : null}
          </div>

          <div className="max-h-[min(70vh,640px)] overflow-y-auto">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                {conversations.length === 0 ? "No conversations yet." : "No conversations match your search."}
              </p>
            ) : (
              <ul>
                {filtered.map((c) => (
                  <li key={c.partner_id} className="border-b border-[#003049]/5 last:border-0">
                    <Link
                      href={`/messages/${encodeURIComponent(c.partner_id)}`}
                      className="flex gap-3 px-4 py-3 transition hover:bg-gray-50"
                    >
                      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[#003049]/10 bg-white">
                        {c.partner_photo ? (
                          <Image
                            src={c.partner_photo}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="44px"
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
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

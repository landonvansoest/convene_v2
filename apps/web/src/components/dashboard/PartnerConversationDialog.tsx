"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dashboardInputClass } from "@/app/dashboard/DashboardViewShell";
import { formatChatMessageDate } from "@/lib/messages/formatMessageDate";
import { RescheduleOfferMessageActions } from "@/components/messages/RescheduleOfferMessageActions";
import { OfferMessageBody } from "@/components/messages/OfferMessageBody";
import { MessageBodyText } from "@/components/messages/MessageBodyText";
import { SendOfferDialog } from "@/components/dashboard/SendOfferDialog";
import { SessionPaymentDialog } from "@/components/dashboard/SessionPaymentDialog";
import { VisibleTempDot } from "@/components/presence/VisibleTempDot";

type Msg = {
  id: string;
  sender_id: string;
  message_body: string;
  created_at?: string;
  offer_id?: string | null;
  offer_type?: string | null;
  offer_status?: string | null;
  offer_payload?: Record<string, unknown> | null;
  companion_message?: string | null;
  sender_name?: string | null;
};

export type PartnerConversationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerId: string | null;
  partnerName: string | null;
  partnerPhoto?: string | null;
  partnerExpertVisibilityState?: string | null;
  /** When true, show a static demo thread (dashboard tour) and do not call APIs. */
  tourDemo?: boolean;
};

export function PartnerConversationDialog({
  open,
  onOpenChange,
  partnerId,
  partnerName,
  partnerPhoto,
  partnerExpertVisibilityState = null,
  tourDemo = false,
}: PartnerConversationDialogProps) {
  const [meId, setMeId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [threadErr, setThreadErr] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [hasExpertProfile, setHasExpertProfile] = useState(false);
  const [suggestOfferOpen, setSuggestOfferOpen] = useState(false);
  const [payBookingId, setPayBookingId] = useState<string | null>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);

  const demoMessages = useMemo((): Msg[] => {
    const other = partnerId ?? "partner";
    return [
      {
        id: "demo-1",
        sender_id: other,
        message_body: "Hello — looking forward to our session.",
        created_at: "Earlier",
      },
    ];
  }, [partnerId]);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const loadThread = useCallback(
    async (pid: string) => {
      setThreadErr(null);
      setThreadLoading(true);
      const res = await fetch(`/api/messages/conversation/${encodeURIComponent(pid)}`);
      const data = await res.json();
      setThreadLoading(false);
      if (!res.ok) {
        setThreadErr(typeof data.error === "string" ? data.error : "Failed to load thread");
        setMessages([]);
        return;
      }
      setMessages((data.messages as Msg[]) ?? []);
    },
    [],
  );

  useEffect(() => {
    if (!open || !partnerId) {
      setMessages([]);
      setBody("");
      setThreadErr(null);
      return;
    }
    if (tourDemo) {
      setThreadLoading(false);
      setThreadErr(null);
      setMessages(demoMessages);
      return;
    }
    void loadThread(partnerId);
  }, [open, partnerId, tourDemo, loadThread, demoMessages]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (tourDemo || !partnerId || !body.trim()) return;
    setSending(true);
    setThreadErr(null);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId: partnerId, messageBody: body.trim() }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      setThreadErr(typeof data.error === "string" ? data.error : "Send failed");
      return;
    }
    setBody("");
    await loadThread(partnerId);
  }

  const title = partnerName?.trim() || (partnerId ? `${partnerId.slice(0, 8)}…` : "Messages");

  const partnerFull = partnerName?.trim() ?? "Conversation partner";
  const partnerFirst = partnerFull.split(/\s+/)[0] ?? partnerFull;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-[#003049]/10 px-4 py-3 text-left">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#003049]/10 bg-white">
              {partnerPhoto ? (
                <Image src={partnerPhoto} alt="" fill className="object-cover" sizes="40px" unoptimized />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[#003049]/35">
                  {title.slice(0, 1).toUpperCase()}
                </div>
              )}
              <VisibleTempDot expertVisibilityState={partnerExpertVisibilityState} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base text-[#003049]">{title}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {tourDemo ? "Demo conversation" : "Message thread"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {threadErr ? <p className="px-4 py-2 text-sm text-red-600">{threadErr}</p> : null}

        <div className="min-h-[200px] flex-1 space-y-3 overflow-y-auto bg-gray-50/40 p-4">
          {threadLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
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
                        variant={mine ? "solidMine" : "theirs"}
                      />
                    ) : (
                      <MessageBodyText
                        text={m.message_body}
                        variant={mine ? "solidMine" : "theirs"}
                      />
                    )}
                    <RescheduleOfferMessageActions
                      message={m}
                      viewerUserId={meId}
                      variant={mine ? "mineSolid" : "theirs"}
                      onThreadChanged={() => void (partnerId && loadThread(partnerId))}
                      onAcceptPayment={(bookingId) => setPayBookingId(bookingId)}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={(e) => void onSend(e)} className="border-t border-[#003049]/10 bg-white p-4">
          <div className="flex gap-2">
            <input
              ref={composerInputRef}
              className={`${dashboardInputClass} min-w-0 flex-1`}
              placeholder={tourDemo ? "Demo — sending disabled" : "Write a message"}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={tourDemo}
            />
            <button
              type="submit"
              disabled={sending || !body.trim() || tourDemo}
              className="shrink-0 rounded-lg bg-[#F77F00] px-4 py-2 text-sm font-medium text-white shadow-sm disabled:pointer-events-none disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
        {!tourDemo && hasExpertProfile && partnerId ? (
          <div className="border-t border-[#003049]/10 bg-white px-4 py-3">
            <button
              type="button"
              className="w-full rounded-lg border border-[#003049]/20 bg-[#003049]/4 py-2.5 text-center text-sm font-semibold text-[#003049] transition hover:bg-[#003049]/10"
              onClick={() => setSuggestOfferOpen(true)}
            >
              Suggest — send an offer
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
    {hasExpertProfile && partnerId && !tourDemo ? (
      <SendOfferDialog
        open={suggestOfferOpen}
        onOpenChange={setSuggestOfferOpen}
        recipientUserId={partnerId}
        recipientFullName={partnerFull}
        recipientFirstName={partnerFirst}
        relatedBookingId={null}
        onSubmitted={() => void (partnerId && loadThread(partnerId))}
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
        if (partnerId) void loadThread(partnerId);
      }}
    />
    </>
  );
}

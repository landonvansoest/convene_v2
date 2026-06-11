"use client";

import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ThreadMessageWithOffer = {
  id: string;
  sender_id: string;
  message_body: string;
  created_at?: string;
  offer_id?: string | null;
  offer_type?: string | null;
  offer_status?: string | null;
};

type Props = {
  message: ThreadMessageWithOffer;
  viewerUserId: string | null | undefined;
  /**
   * `mineSolid` — orange bubble + white text (messages modal / full page).
   * `mineMuted` — light orange tint + dark text (dashboard inbox).
   * `theirs` — partner message (recipient actions appear here).
   */
  variant: "mineSolid" | "mineMuted" | "theirs";
  onThreadChanged?: () => void | Promise<void>;
  composerInputRef?: RefObject<HTMLInputElement | null>;
};

export function RescheduleOfferMessageActions({
  message,
  viewerUserId,
  variant,
  onThreadChanged,
  composerInputRef,
}: Props) {
  const oid = message.offer_id;
  const status = message.offer_status;
  const kind = message.offer_type;
  const viewerIsRecipient = Boolean(viewerUserId && message.sender_id !== viewerUserId);
  const show =
    kind === "time_suggestion" &&
    typeof oid === "string" &&
    viewerIsRecipient &&
    status === "offered";

  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  if (!show) return null;

  async function respond(action: "accept" | "decline") {
    if (!oid || busy) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/offers/${encodeURIComponent(oid)}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        window.alert(typeof data.error === "string" ? data.error : "Could not update request");
        return;
      }
      await onThreadChanged?.();
    } catch {
      window.alert("Network error.");
    } finally {
      setBusy(null);
    }
  }

  function focusComposer() {
    const el = composerInputRef?.current;
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  const solidMine = variant === "mineSolid";
  const mutedMine = variant === "mineMuted";
  const theirsLike = variant === "theirs" || mutedMine;

  return (
    <div
      className={cn(
        "mt-2 flex flex-wrap gap-2 border-t pt-2",
        solidMine ? "border-white/25" : "border-[#003049]/12",
      )}
    >
      <Button
        type="button"
        size="sm"
        className={cn(
          "h-8 border-0 px-3 text-xs font-semibold shadow-none",
          solidMine && "bg-white text-[#F77F00] hover:bg-white/90",
          !solidMine && theirsLike && "bg-[#F77F00] text-white hover:bg-[#F77F00]/90",
        )}
        disabled={busy !== null}
        onClick={() => void respond("accept")}
      >
        {busy === "accept" ? "…" : "Accept"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(
          "h-8 px-3 text-xs font-semibold",
          solidMine &&
            "!border-white/55 bg-transparent text-white hover:bg-white/15 hover:!text-white",
          !solidMine &&
            theirsLike &&
            "!border-[#003049]/25 bg-white text-[#003049] hover:bg-[#003049]/5",
        )}
        disabled={busy !== null}
        onClick={() => void respond("decline")}
      >
        {busy === "decline" ? "…" : "Decline"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          "h-8 px-3 text-xs font-semibold",
          solidMine && "text-white hover:bg-white/15",
          !solidMine && theirsLike && "text-[#003049] hover:bg-[#003049]/8 hover:underline",
        )}
        onClick={focusComposer}
      >
        Message
      </Button>
    </div>
  );
}

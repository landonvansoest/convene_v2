"use client";

import {
  buildOfferInboxView,
  companionMessageFromOfferBody,
} from "@/lib/offers/format-offer-display";
import { MessageBodyText } from "@/components/messages/MessageBodyText";
import { cn } from "@/lib/utils";

type Props = {
  offerType?: string | null;
  offerPayload?: Record<string, unknown> | null;
  offerStatus?: string | null;
  companionMessage?: string | null;
  senderName?: string | null;
  messageBody?: string;
  variant?: "inbox" | "solidMine" | "theirs";
};

export function OfferMessageBody({
  offerType,
  offerPayload,
  offerStatus,
  companionMessage,
  senderName,
  messageBody,
  variant = "theirs",
}: Props) {
  const solidMine = variant === "solidMine";

  const view = buildOfferInboxView({
    offerType,
    payload: offerPayload,
    offerStatus,
    companionMessage:
      companionMessage?.trim() ||
      companionMessageFromOfferBody(messageBody) ||
      null,
    senderName,
  });

  if (!view) {
    if (messageBody) {
      return <MessageBodyText text={messageBody} variant={variant === "solidMine" ? "solidMine" : variant} />;
    }
    return null;
  }

  const labelClass = cn(
    "font-medium",
    solidMine ? "text-white/80" : "text-[#003049]/70",
  );
  const valueClass = cn(solidMine ? "text-white" : "text-[#003049]");
  const mutedClass = cn(solidMine ? "text-white/75" : "text-[#003049]/85");

  return (
    <div className={cn("space-y-2 text-sm leading-relaxed", valueClass)}>
      <p className={cn("font-semibold", solidMine ? "text-white" : "text-[#003049]")}>
        📩 Convene — new offer
      </p>

      {view.statusLabel ? (
        <p className={cn("text-xs font-semibold uppercase tracking-wide", mutedClass)}>
          {view.statusLabel}
        </p>
      ) : null}

      <p>
        <span className={labelClass}>Type:</span> {view.typeLabel}
      </p>

      {view.lines.map((line) => (
        <p key={line.label}>
          <span className={labelClass}>{line.label}:</span> {line.value}
        </p>
      ))}

      {view.totalPriceUsd != null ? (
        <p>
          <span className={labelClass}>Total Price (USD):</span>{" "}
          <span className="font-semibold tabular-nums">${view.totalPriceUsd.toFixed(2)}</span>
        </p>
      ) : null}

      {view.companionMessage ? (
        <div className="pt-1">
          <p className={labelClass}>
            Message from {view.senderFirstName ?? "Expert"}:
          </p>
          <p className={cn("mt-1 whitespace-pre-wrap", mutedClass)}>{view.companionMessage}</p>
        </div>
      ) : null}
    </div>
  );
}

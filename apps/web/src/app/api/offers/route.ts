import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import {
  displayName,
  findOrCreateConversationForPair,
  getAuthedUserId,
  getUsersByIds,
  maybeDispatchMessageNotification,
} from "@/lib/messages/service";
import { normalizeWallTimeForPg } from "@/lib/offers/session-time";
import { persistBookingDependability } from "@/lib/dependability-persist";

export const dynamic = "force-dynamic";

const offerSchema = z.object({
  toUserId: z.string().uuid(),
  offerType: z.enum(["time_suggestion", "custom_offer", "package_deal", "freelance_prep"]),
  payload: z.record(z.string(), z.unknown()),
  relatedBookingId: z.string().uuid().optional().nullable(),
  companionMessage: z.string().max(8000).optional().nullable(),
});

export type DbOfferType = z.infer<typeof offerSchema>["offerType"];

function formatOfferMessage(args: {
  offerType: DbOfferType;
  payload: Record<string, unknown>;
  companionMessage?: string | null;
}) {
  const qbRaw = args.payload.quote_breakdown;
  const payload = { ...args.payload };
  delete payload.quote_breakdown;
  const lines: string[] = ["📩 Convene — new offer"];

  switch (args.offerType) {
    case "time_suggestion": {
      const d = String(payload.proposed_session_date ?? payload.session_date ?? "—");
      const start = String(payload.start_time ?? "—");
      const end = String(payload.end_time ?? "—");
      lines.push("Type: suggested time / reschedule");
      lines.push(`Requested date: ${d}`);
      lines.push(`Time: ${start} – ${end}`);
      break;
    }
    case "custom_offer": {
      const p = payload;
      const keys = Object.keys(p).filter((k) => k !== "related_booking_id" && k !== "quote_breakdown");
      const date = p.proposed_session_date ?? p.session_date;
      const start = p.start_time;
      const end = p.end_time;
      if (date && start && end) {
        lines.push("Type: session offer (suggested time)");
        lines.push(`Requested date: ${String(date)}`);
        lines.push(`Time: ${String(start)} – ${String(end)}`);
        if (typeof p.duration_minutes === "number") {
          lines.push(`Duration (minutes): ${String(p.duration_minutes)}`);
        }
        if (p.total_price != null) {
          lines.push(`Session price (USD): $${String(p.total_price)}`);
        }
      } else if (
        typeof p.duration_minutes === "number" &&
        p.total_price != null &&
        keys.length <= 4
      ) {
        lines.push("Type: custom session price");
        lines.push(`Duration (minutes): ${String(p.duration_minutes)}`);
        lines.push(`Total price (USD): $${String(p.total_price)}`);
      } else {
        lines.push("Type: combined / custom offer");
        if (keys.length === 0) lines.push("(No structured fields)");
        else
          for (const k of keys) {
            lines.push(`${k}: ${JSON.stringify((p as Record<string, unknown>)[k])}`);
          }
      }
      break;
    }
    case "package_deal": {
      const n = payload.session_count ?? payload.package_sessions;
      const p = payload.package_price;
      lines.push("Type: multi-session package");
      if (n != null) lines.push(`Sessions: ${String(n)}`);
      if (p != null) lines.push(`Package price (USD): $${String(p)}`);
      break;
    }
    case "freelance_prep": {
      lines.push("Type: freelance / prep · review");
      const hours = payload.duration_hours;
      const deadline = payload.deadline;
      const price = payload.total_price;
      const desc = payload.description;
      if (hours != null) lines.push(`Duration (hours): ${String(hours)}`);
      if (deadline != null) lines.push(`Deadline: ${String(deadline)}`);
      if (price != null) lines.push(`Total price (USD): $${String(price)}`);
      if (typeof desc === "string" && desc.trim()) lines.push(`Work description:\n${desc.trim()}`);
      break;
    }
    default:
      lines.push("Type: special offer");
  }

  if (
    qbRaw &&
    typeof qbRaw === "object" &&
    typeof (qbRaw as { total_offer_price_usd?: unknown }).total_offer_price_usd === "number"
  ) {
    const t = (qbRaw as { total_offer_price_usd: number }).total_offer_price_usd;
    lines.push("", `Quoted total (booking + Convene fees): $${t.toFixed(2)}`);
  }

  if (args.companionMessage?.trim()) {
    lines.push("");
    lines.push("Message:");
    lines.push(args.companionMessage.trim());
  }

  return lines.join("\n");
}

export async function POST(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = offerSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const { toUserId, offerType, payload, relatedBookingId, companionMessage } = parsed.data;
  if (toUserId === userId) {
    return Response.json({ error: "Cannot send an offer to yourself" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: meRow, error: meErr } = await admin
    .from("users")
    .select("user_id, has_expert_profile")
    .eq("user_id", userId)
    .maybeSingle();
  if (meErr || !meRow) {
    return Response.json({ error: meErr ? publicApiError(meErr) : "Profile not found" }, { status: 500 });
  }

  const isExpert = Boolean(meRow.has_expert_profile);

  if (offerType !== "time_suggestion" && !isExpert) {
    return Response.json({ error: "Only experts can send this offer type" }, { status: 403 });
  }

  /** Reschedule-style time suggestion must reference a booking; learner ↔ expert only. */
  if (offerType === "time_suggestion") {
    if (!relatedBookingId) {
      return Response.json({ error: "Reschedule/time offers require relatedBookingId" }, { status: 400 });
    }
    const { data: booking, error: boErr } = await admin
      .from("bookings")
      .select("booking_id, learner_user_id, expert_user_id")
      .eq("booking_id", relatedBookingId)
      .maybeSingle();
    if (boErr) return Response.json({ error: publicApiError(boErr) }, { status: 500 });
    if (!booking) return Response.json({ error: "Booking not found" }, { status: 404 });

    const isLearner = booking.learner_user_id === userId;
    const isBookingExpert = booking.expert_user_id === userId;

    if (!isLearner && !isBookingExpert) {
      return Response.json({ error: "Forbidden for this booking" }, { status: 403 });
    }

    const expectedRecipient = isLearner ? booking.expert_user_id : booking.learner_user_id;
    if (toUserId !== expectedRecipient) {
      return Response.json(
        { error: "Offer recipient must be the other party on this booking" },
        { status: 403 },
      );
    }
  }

  /** Non–time suggestions from inbox: experts only; ensure recipient isn't self. Reuses expert profile check above */
  const mergedPayload =
    relatedBookingId ? { ...payload, related_booking_id: relatedBookingId } : payload;

  const messageBody = formatOfferMessage({ offerType, payload: mergedPayload, companionMessage });

  const insertPayload = {
    offer_type: offerType,
    from_user_id: userId,
    to_user_id: toUserId,
    status: "offered" as const,
    payload: mergedPayload as Record<string, unknown>,
    creates_booking_id: null as string | null,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data: offerRow, error: insOfferErr } = await admin.from("offers").insert(insertPayload).select("*").single();
    if (insOfferErr) {
      return Response.json({ error: publicApiError(insOfferErr) }, { status: 500 });
    }

    const nowIso = new Date().toISOString();

    /** New reschedule supersedes any still-open time offer for the same booking. */
    if (offerType === "time_suggestion" && relatedBookingId) {
      const { data: priorRows, error: priorErr } = await admin
        .from("offers")
        .select("offer_id, payload")
        .eq("status", "offered")
        .eq("offer_type", "time_suggestion")
        .neq("offer_id", offerRow.offer_id);
      if (priorErr) {
        return Response.json({ error: publicApiError(priorErr) }, { status: 500 });
      }
      const toCancel = (priorRows ?? []).filter((r) => {
        const p = (r.payload ?? {}) as Record<string, unknown>;
        return String(p.related_booking_id ?? "") === relatedBookingId;
      });
      if (toCancel.length > 0) {
        const { error: cancelErr } = await admin
          .from("offers")
          .update({ status: "cancelled", updated_at: nowIso })
          .in(
            "offer_id",
            toCancel.map((r) => String(r.offer_id)),
          );
        if (cancelErr) {
          return Response.json({ error: publicApiError(cancelErr) }, { status: 500 });
        }
      }
    }

    const conversation = await findOrCreateConversationForPair(userId, toUserId);
    const meta: Record<string, unknown> = {
      offer_id: offerRow.offer_id,
      offer_type: offerType,
    };
    if (companionMessage?.trim()) {
      meta.companion_message = companionMessage.trim();
    }
    const { data: msgRow, error: msgErr } = await admin
      .from("messages")
      .insert({
        conversation_id: conversation.conversation_id,
        sender_id: userId,
        message: messageBody,
        is_read: false,
        metadata: meta as Record<string, unknown>,
      })
      .select("message_id")
      .single();
    if (msgErr || !msgRow) {
      return Response.json({ error: publicApiError(msgErr ?? "Message insert failed") }, { status: 500 });
    }

    if (offerType === "time_suggestion" && relatedBookingId) {
      const pay = mergedPayload as Record<string, unknown>;
      const dateRaw = pay.proposed_session_date ?? pay.session_date;
      const sessionDate = typeof dateRaw === "string" ? dateRaw.trim() : "";
      const st = normalizeWallTimeForPg(pay.start_time);
      const et = normalizeWallTimeForPg(pay.end_time);
      if (sessionDate && st && et) {
        const { error: boErr } = await admin
          .from("bookings")
          .update({
            pending_reschedule_date: sessionDate,
            pending_reschedule_start_time: st,
            pending_reschedule_end_time: et,
            reschedule_request_id: msgRow.message_id,
            updated_at: nowIso,
          })
          .eq("booking_id", relatedBookingId);
        if (boErr) {
          return Response.json({ error: publicApiError(boErr) }, { status: 500 });
        }
        // Bible §"Dependability Rating": reschedule-suggestion deductions
        // (10/20/30/40/55/70 pts depending on how far before scheduled start)
        // apply to the proposer the moment the suggestion lands.
        try {
          await persistBookingDependability(admin, relatedBookingId);
        } catch {
          // Non-fatal — score can be recomputed by any later event.
        }
      }
    }

    await admin
      .from("conversations")
      .update({ updated_at: nowIso, last_message_at: nowIso })
      .eq("conversation_id", conversation.conversation_id);

    await maybeDispatchMessageNotification({ senderId: userId, recipientId: toUserId, messageBody });

    const [sender] = await getUsersByIds([userId]);
    return Response.json({
      ok: true,
      offer: offerRow,
      preview: `${displayName(sender)} sent an offer`,
    });
  } catch (e) {
    return Response.json({ error: publicApiError(e, "Failed to record offer") }, { status: 500 });
  }
}

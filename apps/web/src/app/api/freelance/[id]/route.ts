import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import {
  FREELANCE_ACTIONS,
  expertGraceEndAt,
  learnerCompletionDeadlineAt,
  rectificationDeadlineAt,
  type FreelanceAction,
} from "@/lib/freelance/transitions";
import { dispatchFreelanceReviewAlert } from "@/lib/notifications/admin-alerts";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const ACTION_KEYS = [
  "accept",
  "decline",
  "reoffer",
  "submit_completion",
  "accept_completion",
  "decline_completion",
] as const satisfies ReadonlyArray<FreelanceAction>;

const patchSchema = z
  .object({
    action: z.enum(ACTION_KEYS),
    /** Free-form reason a learner may attach to a decline / decline_completion. */
    reason: z.string().max(2000).optional().nullable(),
    /** Expert handoff note attached to `submit_completion`. */
    completionMessage: z.string().max(8000).optional().nullable(),
    /** Optional attachments for the completion handoff. */
    completionAttachments: z
      .array(
        z.object({
          url: z.string().url(),
          name: z.string().max(200).optional(),
          size_bytes: z.number().int().nonnegative().optional(),
          mime: z.string().max(120).optional(),
        }),
      )
      .max(20)
      .optional(),
    /** If reoffering, the new fields the expert is revising. All optional;
     *  unspecified fields carry over from the original row. */
    revision: z
      .object({
        descriptionOfWork: z.string().min(1).max(8000).optional(),
        totalPrice: z.number().nonnegative().optional(),
        rate: z.number().nonnegative().optional().nullable(),
        deadline: z.string().max(40).nullable().optional(),
        durationMinutes: z.number().int().positive().optional().nullable(),
      })
      .optional(),
  })
  .strict();

export async function GET(_request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const { data: row, error } = await admin.from("freelance_work").select("*").eq("freelance_id", id).maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (row.expert_user_id !== userId && row.learner_user_id !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return Response.json({
    freelance: {
      ...row,
      user_role: row.learner_user_id === userId ? ("learner" as const) : ("expert" as const),
    },
  });
}

/**
 * Bible §"freelance_work — status enum, transitions, keys, payment".
 *
 * Action-based: callers pass `action` (accept, decline, reoffer,
 * submit_completion, accept_completion, decline_completion) and the route:
 *  1. validates the actor matches the row (learner vs expert),
 *  2. validates the current status is a valid prerequisite (via the
 *     FREELANCE_ACTIONS table in lib/freelance/transitions.ts),
 *  3. applies the status change AND keeps the SLA deadlines in lockstep
 *     using the helpers from the same module.
 *
 * System-driven transitions (Stripe webhook → paid_in_progress, cron →
 * auto_release / escalate_missed_deadline, admin → admin_resolve_*) bypass
 * this route and live in their dedicated handlers.
 */
export async function PATCH(request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error: fetchErr } = await admin
    .from("freelance_work")
    .select("*")
    .eq("freelance_id", id)
    .maybeSingle();

  if (fetchErr) {
    return Response.json({ error: publicApiError(fetchErr) }, { status: 500 });
  }
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const action = parsed.data.action;
  const spec = FREELANCE_ACTIONS[action];
  if (!spec.from.includes(row.status)) {
    return Response.json(
      { error: `Cannot ${action} from status '${row.status}'` },
      { status: 409 },
    );
  }

  // Actor check. Each action is locked to either the expert or the learner.
  const isLearner = row.learner_user_id === userId;
  const isExpert = row.expert_user_id === userId;
  if (spec.actor === "learner" && !isLearner) {
    return Response.json({ error: `Only the learner may ${action}` }, { status: 403 });
  }
  if (spec.actor === "expert" && !isExpert) {
    return Response.json({ error: `Only the expert may ${action}` }, { status: 403 });
  }
  if (spec.actor === "system" || spec.actor === "admin") {
    return Response.json({ error: `${action} cannot be invoked from this endpoint` }, { status: 403 });
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: spec.to, updated_at: now };

  switch (action) {
    case "accept": {
      // Bible: "skip middle if payment synchronous". The Stripe webhook will
      // flip us to paid_in_progress once the PI succeeds. Until then we sit
      // in accepted_pending_payment so the expert can see the offer was
      // taken even if the learner abandons checkout.
      break;
    }
    case "decline": {
      update.decline_reason = parsed.data.reason ?? null;
      break;
    }
    case "reoffer": {
      // Reset the offer with the (optional) revision. Clears decline_reason.
      update.decline_reason = null;
      const r = parsed.data.revision;
      if (r) {
        if (r.descriptionOfWork !== undefined) update.description_of_work = r.descriptionOfWork;
        if (r.totalPrice !== undefined) update.total_price = r.totalPrice;
        if (r.rate !== undefined) update.rate = r.rate;
        if (r.deadline !== undefined) {
          update.deadline = r.deadline ?? null;
          const wd = r.deadline ? normalizeIsoTimestamp(r.deadline) : null;
          update.work_deadline = wd;
          update.expert_grace_end_at = expertGraceEndAt(wd);
        }
        if (r.durationMinutes !== undefined) {
          update.duration =
            r.durationMinutes != null && r.durationMinutes > 0
              ? `${r.durationMinutes} minutes`
              : null;
        }
      }
      break;
    }
    case "submit_completion": {
      // Bible §"Mark as complete": expert may attach a message + files.
      // Starts the 3-day learner review clock.
      const submitted = now;
      update.completion_submitted_at = submitted;
      update.learner_completion_deadline_at = learnerCompletionDeadlineAt(submitted);
      if (parsed.data.completionMessage !== undefined) {
        update.completion_message = parsed.data.completionMessage;
      }
      if (parsed.data.completionAttachments) {
        update.completion_attachments = parsed.data.completionAttachments;
      }
      break;
    }
    case "accept_completion": {
      // Bible §"Accept: release payout to expert". We record the release
      // timestamp here; the actual Stripe Connect transfer is queued by
      // /api/cron/freelance-auto-release (or a future webhook hook). The
      // transactions ledger row was already written at charge time.
      update.payout_released_at = now;
      break;
    }
    case "decline_completion": {
      // Bible §"Decline: learner messages, expert has 3 calendar days to
      // rectify; unresolved → admin_review". We move straight to admin_review
      // here and start the rectification clock; if the expert produces a
      // satisfactory fix, the admin marks it completed inside the queue UI.
      update.admin_review_at = now;
      update.admin_review_reason = parsed.data.reason ?? "Learner declined completion";
      update.rectification_deadline_at = rectificationDeadlineAt(now);
      break;
    }
  }

  const { data: updated, error: updErr } = await admin
    .from("freelance_work")
    .update(update)
    .eq("freelance_id", id)
    .select("*")
    .single();

  if (updErr) {
    return Response.json({ error: publicApiError(updErr) }, { status: 500 });
  }

  if (parsed.data.action === "decline_completion" && updated?.status === "admin_review") {
    try {
      await dispatchFreelanceReviewAlert({
        freelanceId: id,
        reason: (updated as { admin_review_reason?: string | null }).admin_review_reason ?? null,
        totalPrice: (updated as { total_price?: number | string | null }).total_price ?? null,
      });
    } catch {
      /* best-effort */
    }
  }

  return Response.json({ freelance: updated });
}

function normalizeIsoTimestamp(input: string): string | null {
  const t = Date.parse(input);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

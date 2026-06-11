import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { rectificationDeadlineAt } from "@/lib/freelance/transitions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Bible §"Special bookings — lifecycle":
 *
 *   • "Learner no response to completion within 3 calendar days of expert
 *      submit → auto-release payout to expert (same as accept)."
 *   • "Expert misses work deadline: admin_review; 3 calendar days grace
 *      after deadline; if still incomplete → refund learner."
 *
 * This cron handles both timer-driven transitions in one pass:
 *
 *   completion_submitted + learner_completion_deadline_at <= now
 *     → completed (payout_released_at = now)
 *
 *   paid_in_progress      + expert_grace_end_at          <= now
 *     → admin_review     (admin_review_reason = "Expert missed work deadline + grace")
 *
 * Recommended schedule: every 15 minutes is enough — the 3-day SLA gives us
 * plenty of slack and Vercel's free tier limits cron frequency anyway.
 *
 * Idempotent: rows already past the boundary that have already transitioned
 * are excluded by the `status` filter so a duplicate run is a no-op.
 */
function cronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    try {
      const a = Buffer.from(token);
      const b = Buffer.from(secret);
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("secret");
  if (!q) return false;
  try {
    const a = Buffer.from(q);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!cronAuth(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // ---- 1) Auto-release: completion_submitted past 3-day learner window ----

  const { data: autoReleaseCandidates, error: arErr } = await admin
    .from("freelance_work")
    .select("freelance_id, completion_submitted_at, learner_completion_deadline_at")
    .eq("status", "completion_submitted")
    .lte("learner_completion_deadline_at", nowIso);

  if (arErr) {
    return Response.json({ error: publicApiError(arErr) }, { status: 500 });
  }

  let autoReleased = 0;
  const autoReleaseFailures: Array<{ id: string; error: string }> = [];
  for (const row of autoReleaseCandidates ?? []) {
    const { error } = await admin
      .from("freelance_work")
      .update({
        status: "completed",
        payout_released_at: nowIso,
        updated_at: nowIso,
      })
      .eq("freelance_id", row.freelance_id)
      // Guard against a race with manual learner-accept happening at the
      // same moment — only flip if the row is still completion_submitted.
      .eq("status", "completion_submitted");
    if (error) {
      autoReleaseFailures.push({ id: String(row.freelance_id), error: error.message });
    } else {
      autoReleased += 1;
    }
  }

  // ---- 2) Missed deadline escalation: paid_in_progress past grace window --

  const { data: missedDeadlineCandidates, error: mdErr } = await admin
    .from("freelance_work")
    .select("freelance_id, work_deadline, expert_grace_end_at")
    .eq("status", "paid_in_progress")
    .not("expert_grace_end_at", "is", null)
    .lte("expert_grace_end_at", nowIso);

  if (mdErr) {
    return Response.json({ error: publicApiError(mdErr) }, { status: 500 });
  }

  let escalated = 0;
  const escalateFailures: Array<{ id: string; error: string }> = [];
  for (const row of missedDeadlineCandidates ?? []) {
    const { error } = await admin
      .from("freelance_work")
      .update({
        status: "admin_review",
        admin_review_at: nowIso,
        admin_review_reason: "Expert missed work deadline + 3-day grace",
        rectification_deadline_at: rectificationDeadlineAt(nowIso),
        updated_at: nowIso,
      })
      .eq("freelance_id", row.freelance_id)
      .eq("status", "paid_in_progress");
    if (error) {
      escalateFailures.push({ id: String(row.freelance_id), error: error.message });
    } else {
      escalated += 1;
    }
  }

  return Response.json({
    success: true,
    autoReleased,
    escalated,
    failures: [...autoReleaseFailures, ...escalateFailures],
  });
}

export async function POST(request: Request) {
  return GET(request);
}

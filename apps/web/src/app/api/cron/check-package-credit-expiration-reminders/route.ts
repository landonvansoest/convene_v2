import { timingSafeEqual } from "node:crypto";
import { publicApiError } from "@/lib/api/public-error";
import { dispatchPackageCreditExpiring } from "@/lib/notifications/package-notifications";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Half-day tolerance — cron runs daily; catches credits expiring near each threshold. */
const WINDOW_MS = 12 * 60 * 60 * 1000;

const THRESHOLDS = [
  { days: 30, sentCol: "expiry_reminder_30d_sent_at", label: "1 month" },
  { days: 14, sentCol: "expiry_reminder_14d_sent_at", label: "2 weeks" },
  { days: 7, sentCol: "expiry_reminder_7d_sent_at", label: "1 week" },
  { days: 3, sentCol: "expiry_reminder_3d_sent_at", label: "3 days" },
] as const;

type CreditRow = {
  credit_id: string;
  learner_user_id: string;
  remaining_credits: number;
  expiration_at: string;
  expert_packages:
    | { title: string; expert_user_id: string }
    | { title: string; expert_user_id: string }[]
    | null;
};

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

function embedPkg(row: CreditRow) {
  const embed = row.expert_packages;
  if (!embed) return null;
  return Array.isArray(embed) ? embed[0] : embed;
}

export async function GET(request: Request) {
  if (!cronAuth(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const remindersSent: Array<{ creditId: string; threshold: string }> = [];

  for (const threshold of THRESHOLDS) {
    const target = now + threshold.days * DAY_MS;
    const minExp = new Date(target - WINDOW_MS).toISOString();
    const maxExp = new Date(target + WINDOW_MS).toISOString();

    const { data, error } = await admin
      .from("learner_package_credits")
      .select(
        `
        credit_id,
        learner_user_id,
        remaining_credits,
        expiration_at,
        expert_packages ( title, expert_user_id )
      `
      )
      .gt("remaining_credits", 0)
      .not("expiration_at", "is", null)
      .gte("expiration_at", minExp)
      .lte("expiration_at", maxExp)
      .is(threshold.sentCol, null);

    if (error) {
      return Response.json({ error: publicApiError(error) }, { status: 500 });
    }

    for (const row of (data ?? []) as CreditRow[]) {
      const pkg = embedPkg(row);
      if (!pkg?.expert_user_id || !row.expiration_at) continue;

      try {
        await dispatchPackageCreditExpiring({
          learnerUserId: row.learner_user_id,
          expertUserId: pkg.expert_user_id,
          packageTitle: pkg.title ?? "Package",
          remainingCredits: row.remaining_credits,
          expirationAt: row.expiration_at,
          daysUntilExpiryLabel: threshold.label,
        });
      } catch {
        continue;
      }

      const ts = new Date().toISOString();
      const updatePayload: Record<string, string> = {
        [threshold.sentCol]: ts,
        updated_at: ts,
      };
      await admin
        .from("learner_package_credits")
        .update(updatePayload)
        .eq("credit_id", row.credit_id);

      remindersSent.push({ creditId: row.credit_id, threshold: threshold.label });
    }
  }

  return Response.json({
    success: true,
    remindersSent: remindersSent.length,
    details: remindersSent,
  });
}

export async function POST(request: Request) {
  return GET(request);
}

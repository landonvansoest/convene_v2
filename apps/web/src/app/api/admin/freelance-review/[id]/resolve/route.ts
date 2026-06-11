import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { FREELANCE_ACTIONS } from "@/lib/freelance/transitions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const resolveSchema = z
  .object({
    resolution: z.enum(["complete", "refund"]),
    note: z.string().max(2000).optional().nullable(),
    /** When refunding, optional partial amount in cents. Defaults to full
     *  refund of total_price * 100. */
    refundCents: z.number().int().positive().optional(),
  })
  .strict();

/**
 * Bible §"admin_review → completed | refunded".
 *
 * Admin resolves a freelance_work row stuck in admin_review by either:
 *   - marking it `completed` (payout released to expert), or
 *   - marking it `refunded` (records the refunded amount; the actual Stripe
 *     refund is initiated through the existing booking-refund tooling /
 *     manual Stripe action — this endpoint persists the bookkeeping).
 */
export async function POST(request: Request, { params }: Params) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const { id } = await params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = resolveSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error: fetchErr } = await admin
    .from("freelance_work")
    .select("freelance_id, status, total_price")
    .eq("freelance_id", id)
    .maybeSingle();
  if (fetchErr) return Response.json({ error: publicApiError(fetchErr) }, { status: 500 });
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  const spec =
    parsed.data.resolution === "complete"
      ? FREELANCE_ACTIONS.admin_resolve_complete
      : FREELANCE_ACTIONS.admin_resolve_refund;
  if (!spec.from.includes(row.status)) {
    return Response.json(
      { error: `Cannot resolve from status '${row.status}' (must be admin_review)` },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: spec.to, updated_at: now };
  if (parsed.data.note) {
    update.admin_review_reason = parsed.data.note;
  }
  if (parsed.data.resolution === "complete") {
    update.payout_released_at = now;
  } else {
    const fullCents = Math.round(Number(row.total_price ?? 0) * 100);
    update.refunded_amount_cents = Math.max(
      0,
      Math.min(parsed.data.refundCents ?? fullCents, fullCents),
    );
  }

  const { data: updated, error: updErr } = await admin
    .from("freelance_work")
    .update(update)
    .eq("freelance_id", id)
    .eq("status", "admin_review")
    .select("*")
    .single();
  if (updErr) return Response.json({ error: publicApiError(updErr) }, { status: 500 });

  return Response.json({ freelance: updated });
}

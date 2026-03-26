import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateFirstSessionDiscount } from "@/lib/pricing/first-session-discount";
import { getAuthedUserId } from "@/lib/messages/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Preview first-session discount for the signed-in learner vs this expert.
 * Query: `durationMinutes`, `listPrice` (USD, optional — for amount preview).
 */
export async function GET(request: Request, { params }: Params) {
  const learnerId = await getAuthedUserId();
  if (!learnerId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: expertUserId } = await params;
  const { searchParams } = new URL(request.url);
  const durationMinutes = Math.max(1, Number(searchParams.get("durationMinutes") ?? "60") || 60);
  const listPrice = Number(searchParams.get("listPrice") ?? "100");

  const admin = createAdminClient();
  const evalResult = await evaluateFirstSessionDiscount(admin, {
    expertUserId,
    learnerUserId: learnerId,
    durationMinutes,
    listPriceUsd: listPrice,
  });

  if (!evalResult.eligible) {
    return Response.json({
      eligible: false,
      reason: evalResult.reason,
    });
  }

  return Response.json({
    eligible: true,
    discountUsd: evalResult.discountUsd,
    chargedUsd: evalResult.chargedUsd,
    discountType: evalResult.discountType,
    discountValueRaw: evalResult.discountValueRaw,
  });
}

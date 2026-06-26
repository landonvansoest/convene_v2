import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { respondToExpertBookingRequest } from "@/lib/booking-respond-request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["approve", "decline"]),
  message: z.string().trim().min(1).max(8000),
});

export async function POST(request: Request, { params }: Params) {
  const expertUserId = await getAuthedUserId();
  if (!expertUserId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: bookingId } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await respondToExpertBookingRequest(admin, {
    bookingId,
    expertUserId,
    action: parsed.data.action,
    message: parsed.data.message,
  });

  if (!result.ok) {
    return Response.json({ error: publicApiError(result.error) }, { status: result.status });
  }

  return Response.json({ ok: true, action: parsed.data.action });
}

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { getStripe } from "@/lib/stripe/server";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  priceId: z.string().min(1).optional(),
});

/**
 * Stripe Checkout (subscription mode). Sets metadata.user_id on the subscription for webhook sync.
 */
export async function POST(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    json = {};
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const priceId =
    parsed.data.priceId?.trim() || process.env.STRIPE_SUBSCRIPTION_PRICE_ID?.trim() || "";
  if (!priceId) {
    return Response.json(
      {
        error:
          "No price id: set STRIPE_SUBSCRIPTION_PRICE_ID or POST { priceId } (Stripe Price id, e.g. price_...)",
      },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const { data: userRow, error: userErr } = await admin
    .from("users")
    .select("email_address")
    .eq("user_id", userId)
    .maybeSingle();

  if (userErr) {
    return Response.json({ error: publicApiError(userErr) }, { status: 500 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: userRow?.email_address ?? undefined,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/subscribe?success=1`,
    cancel_url: `${appUrl}/subscribe?canceled=1`,
    subscription_data: {
      metadata: { user_id: userId },
    },
    metadata: { user_id: userId },
  });

  if (!session.url) {
    return Response.json({ error: "Checkout session missing URL" }, { status: 500 });
  }

  return Response.json({ url: session.url, sessionId: session.id });
}

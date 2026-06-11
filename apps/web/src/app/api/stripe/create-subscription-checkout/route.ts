import { z } from "zod";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { getStripe } from "@/lib/stripe/server";
import { publicApiError } from "@/lib/api/public-error";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  priceId: z.string().min(1).optional(),
  /** Path only, e.g. /expert-registration — used for success/cancel redirect (no host, no //). */
  returnPath: z.string().optional(),
});

function safeReturnPath(path: string | undefined, fallback: string): string {
  const p = (path ?? fallback).trim() || fallback;
  if (!p.startsWith("/") || p.startsWith("//") || p.includes("://")) return fallback;
  return p.split("#")[0] ?? fallback;
}

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

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const returnPath = safeReturnPath(parsed.data.returnPath, "/subscribe");
  const successQ = returnPath.includes("?") ? "&" : "?";
  const successUrl = `${appUrl}${returnPath}${successQ}success=1`;
  const cancelUrl = `${appUrl}${returnPath}${returnPath.includes("?") ? "&" : "?"}canceled=1`;

  try {
    let createAdmin: ReturnType<typeof createAdminClient>;
    try {
      createAdmin = createAdminClient();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Configuration error";
      return Response.json({ error: msg }, { status: 500 });
    }

    const { data: userRow, error: userErr } = await createAdmin
      .from("users")
      .select("email_address")
      .eq("user_id", userId)
      .maybeSingle();

    if (userErr) {
      return Response.json({ error: publicApiError(userErr) }, { status: 500 });
    }

    const supabase = await createServerSupabase();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    const customerEmail =
      (userRow?.email_address && String(userRow.email_address).trim()) || authUser?.email || undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: customerEmail,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: { user_id: userId },
      },
      metadata: { user_id: userId },
    });

    if (!session.url) {
      return Response.json({ error: "Checkout session missing URL" }, { status: 500 });
    }

    return Response.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    if (e instanceof Stripe.errors.StripeError) {
      return Response.json(
        { error: e.message, code: e.code, type: e.type },
        { status: e.statusCode && e.statusCode < 500 ? 400 : 502 },
      );
    }
    const message = e instanceof Error ? e.message : "Failed to start checkout";
    return Response.json({ error: message }, { status: 500 });
  }
}

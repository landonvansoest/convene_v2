import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { getStripe } from "@/lib/stripe/server";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  packageId: z.string().uuid(),
});

/**
 * One-time Checkout for an expert package (grants credits via webhook on `checkout.session.completed`).
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
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const { packageId } = parsed.data;
  const admin = createAdminClient();

  const { data: pkg, error: pkgErr } = await admin
    .from("expert_packages")
    .select(
      "package_id, title, price_cents, stripe_price_id, currency, status, is_published, expert_user_id"
    )
    .eq("package_id", packageId)
    .maybeSingle();

  if (pkgErr) {
    return Response.json({ error: publicApiError(pkgErr) }, { status: 500 });
  }
  if (!pkg || pkg.status !== "active" || !pkg.is_published) {
    return Response.json({ error: "Package not available" }, { status: 404 });
  }

  const currency = (pkg.currency ?? "USD").toLowerCase();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  let lineItems: import("stripe").Stripe.Checkout.SessionCreateParams.LineItem[];

  if (pkg.stripe_price_id?.trim()) {
    lineItems = [{ price: pkg.stripe_price_id.trim(), quantity: 1 }];
  } else if (pkg.price_cents != null && Number(pkg.price_cents) > 0) {
    lineItems = [
      {
        price_data: {
          currency,
          unit_amount: Number(pkg.price_cents),
          product_data: {
            name: pkg.title,
            metadata: { package_id: packageId },
          },
        },
        quantity: 1,
      },
    ];
  } else {
    return Response.json({ error: "Package has no price configured" }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: userId,
    line_items: lineItems,
    success_url: `${appUrl}/account?package_purchased=1`,
    cancel_url: `${appUrl}/experts/${pkg.expert_user_id}?package_canceled=1`,
    metadata: {
      convene_type: "package_purchase",
      user_id: userId,
      package_id: packageId,
    },
    payment_intent_data: {
      metadata: {
        convene_type: "package_purchase",
        user_id: userId,
        package_id: packageId,
      },
    },
  });

  if (!session.url) {
    return Response.json({ error: "Checkout session missing URL" }, { status: 500 });
  }

  return Response.json({ url: session.url, sessionId: session.id });
}

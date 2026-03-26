import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateFirstSessionDiscount } from "@/lib/pricing/first-session-discount";
import { displayName, getAuthedUserId, getUsersByIds } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

const createSessionSchema = z
  .object({
    expertId: z.string().uuid(),
    sessionDate: z.string().min(1),
    startTime: z.string().min(1),
    endTime: z.string().min(1),
    durationMinutes: z.number().int().positive(),
    /** List price (before first-session discount). Charged amount may be lower if discount applies. */
    totalPrice: z.number().nonnegative(),
    packageCreditId: z.string().uuid().optional(),
    applyFirstSessionDiscount: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.packageCreditId && data.totalPrice !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "totalPrice must be 0 when redeeming a package credit",
        path: ["totalPrice"],
      });
    }
    if (data.packageCreditId && data.applyFirstSessionDiscount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cannot combine package credit with first-session discount",
        path: ["applyFirstSessionDiscount"],
      });
    }
  });

export async function POST(request: Request) {
  const learnerId = await getAuthedUserId();
  if (!learnerId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSessionSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const {
    expertId,
    sessionDate,
    startTime,
    endTime,
    durationMinutes,
    totalPrice,
    packageCreditId,
    applyFirstSessionDiscount,
  } = parsed.data;
  const admin = createAdminClient();

  const { data: expertProfile, error: expertErr } = await admin
    .from("expert_profiles")
    .select("expert_profile_id")
    .eq("user_id", expertId)
    .maybeSingle();

  if (expertErr) {
    return Response.json({ error: publicApiError(expertErr) }, { status: 500 });
  }
  if (!expertProfile) {
    return Response.json({ error: "Expert profile not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  let paymentStatus: "pending" | "paid" = "pending";
  let bookingAmount = totalPrice;
  let totalAmount = totalPrice;
  let discountApplied = 0;
  let rate = 0;

  if (packageCreditId) {
    const { data: creditRow, error: credErr } = await admin
      .from("learner_package_credits")
      .select(
        `
        credit_id,
        package_id,
        remaining_credits,
        expiration_at,
        expert_packages (
          expert_user_id,
          session_duration_minutes
        )
      `
      )
      .eq("credit_id", packageCreditId)
      .eq("learner_user_id", learnerId)
      .maybeSingle();

    if (credErr) {
      return Response.json({ error: publicApiError(credErr) }, { status: 500 });
    }
    if (!creditRow) {
      return Response.json({ error: "Package credit not found" }, { status: 404 });
    }

    const pkgEmbed = creditRow.expert_packages as
      | { expert_user_id: string; session_duration_minutes: number }
      | { expert_user_id: string; session_duration_minutes: number }[]
      | null;
    const pkg = Array.isArray(pkgEmbed) ? pkgEmbed[0] : pkgEmbed;
    if (!pkg) {
      return Response.json({ error: "Package not found for credit" }, { status: 400 });
    }
    if (pkg.expert_user_id !== expertId) {
      return Response.json({ error: "Credit does not apply to this expert" }, { status: 400 });
    }
    if (durationMinutes !== pkg.session_duration_minutes) {
      return Response.json(
        { error: `Duration must match package session length (${pkg.session_duration_minutes} min)` },
        { status: 400 }
      );
    }
    if (creditRow.remaining_credits <= 0) {
      return Response.json({ error: "No credits remaining" }, { status: 409 });
    }
    if (creditRow.expiration_at) {
      const exp = new Date(creditRow.expiration_at).getTime();
      if (Number.isFinite(exp) && exp < Date.now()) {
        return Response.json({ error: "Package credit has expired" }, { status: 409 });
      }
    }

    paymentStatus = "paid";
    bookingAmount = 0;
    totalAmount = 0;
    rate = 0;
  } else if (applyFirstSessionDiscount) {
    const evalResult = await evaluateFirstSessionDiscount(admin, {
      expertUserId: expertId,
      learnerUserId: learnerId,
      durationMinutes,
      listPriceUsd: totalPrice,
    });
    if (!evalResult.eligible) {
      return Response.json({ error: evalResult.reason }, { status: 400 });
    }
    discountApplied = evalResult.discountUsd;
    bookingAmount = totalPrice;
    totalAmount = evalResult.chargedUsd;
    const hours = durationMinutes / 60;
    rate = hours > 0 ? Number((bookingAmount / hours).toFixed(2)) : 0;
  } else {
    const hours = durationMinutes / 60;
    rate = hours > 0 ? Number((totalPrice / hours).toFixed(2)) : 0;
  }

  const { data: booking, error: insertErr } = await admin
    .from("bookings")
    .insert({
      expert_user_id: expertId,
      learner_user_id: learnerId,
      expert_profile_id: expertProfile.expert_profile_id,
      session_date: sessionDate,
      start_time: startTime,
      end_time: endTime,
      duration: `${durationMinutes} minutes`,
      rate,
      discount_applied: discountApplied,
      booking_amount: bookingAmount,
      total_amount: totalAmount,
      status: "upcoming",
      payment_status: paymentStatus,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insertErr) {
    return Response.json({ error: publicApiError(insertErr) }, { status: 500 });
  }

  if (packageCreditId) {
    const { data: snap } = await admin
      .from("learner_package_credits")
      .select("remaining_credits")
      .eq("credit_id", packageCreditId)
      .eq("learner_user_id", learnerId)
      .maybeSingle();

    if (!snap || snap.remaining_credits <= 0) {
      await admin.from("bookings").delete().eq("booking_id", booking.booking_id);
      return Response.json({ error: "No credits remaining" }, { status: 409 });
    }

    const prev = snap.remaining_credits;
    const { data: dec } = await admin
      .from("learner_package_credits")
      .update({
        remaining_credits: prev - 1,
        updated_at: now,
      })
      .eq("credit_id", packageCreditId)
      .eq("learner_user_id", learnerId)
      .eq("remaining_credits", prev)
      .select("credit_id")
      .maybeSingle();

    if (!dec) {
      await admin.from("bookings").delete().eq("booking_id", booking.booking_id);
      return Response.json({ error: "Could not redeem credit (race or exhausted)" }, { status: 409 });
    }

    const { error: redErr } = await admin.from("package_credit_redemptions").insert({
      credit_id: packageCreditId,
      booking_id: booking.booking_id,
      credits_used: 1,
      created_at: now,
    });

    if (redErr) {
      await admin
        .from("learner_package_credits")
        .update({ remaining_credits: prev, updated_at: now })
        .eq("credit_id", packageCreditId)
        .eq("remaining_credits", prev - 1);
      await admin.from("bookings").delete().eq("booking_id", booking.booking_id);
      return Response.json({ error: publicApiError(redErr) }, { status: 500 });
    }
  }

  return Response.json({ session: booking }, { status: 201 });
}

export async function GET(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");

  const admin = createAdminClient();
  let query = admin
    .from("bookings")
    .select("*")
    .or(`learner_user_id.eq.${userId},expert_user_id.eq.${userId}`)
    .order("session_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (status) query = query.eq("status", status);
  if (type === "upcoming") query = query.gte("session_date", new Date().toISOString().slice(0, 10));
  if (type === "completed") query = query.lt("session_date", new Date().toISOString().slice(0, 10));

  const { data: bookings, error } = await query;
  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const partnerIds = new Set<string>();
  for (const b of bookings ?? []) {
    partnerIds.add(b.learner_user_id === userId ? b.expert_user_id : b.learner_user_id);
  }
  const partners = await getUsersByIds(Array.from(partnerIds));
  const byId = new Map(partners.map((u) => [u.user_id, u]));

  const sessions = (bookings ?? []).map((b) => {
    const partnerId = b.learner_user_id === userId ? b.expert_user_id : b.learner_user_id;
    const partner = byId.get(partnerId);
    return {
      ...b,
      id: b.booking_id,
      learner_id: b.learner_user_id,
      expert_id: b.expert_user_id,
      user_role: b.learner_user_id === userId ? "learner" : "expert",
      partner_name: partner ? displayName(partner) : null,
      partner_photo: partner?.profile_photo ?? null,
      duration_minutes: null,
      total_price: b.total_amount,
      cancellation_reason: b.cancellation_reason,
    };
  });

  return Response.json({ sessions });
}

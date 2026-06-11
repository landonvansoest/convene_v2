import { createAdminClient } from "@/lib/supabase/admin";
import { displayName, getAuthedUserId, getUsersByIds } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

/** Row shape for booking history selects (typed loosely so dynamic `.select()` strings typecheck). */
type BookingHistoryTxRow = {
  transaction_id: string;
  transaction_type: string;
  booking_id: string;
  expert_user_id: string | null;
  learner_user_id: string | null;
  total_charge: number | string | null;
  expert_earnings?: number | string | null;
  status: string;
  payment_method?: string | null;
  transaction_date?: string | null;
  created_at?: string | null;
};

/** Short display ref for search (Bible / v1 “order number” style — not a separate human id column). */
function bookingOrderRef(bookingId: string): string {
  const compact = bookingId.replace(/-/g, "");
  return compact.slice(0, 8).toUpperCase();
}

/**
 * GET ledger rows for the signed-in user (recent first).
 * Default: full ledger fields (account/admin tooling).
 * `bookingHistory=1`: session booking + extension charges only; sanitized shape for learner dashboard (no gateway ids).
 */
export async function GET(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const bookingHistory = searchParams.get("bookingHistory") === "1";
  const expertEarnings = searchParams.get("expertEarnings") === "1";

  if (bookingHistory) {
    const cap = Math.min(
      Number(searchParams.get("limit") ?? (expertEarnings ? "2000" : "80")) ||
        (expertEarnings ? 2000 : 80),
      expertEarnings ? 2500 : 120,
    );
    const admin = createAdminClient();
    const { data, error } = expertEarnings
      ? await admin
          .from("transactions")
          .select(
            "transaction_id, transaction_type, booking_id, expert_user_id, learner_user_id, total_charge, expert_earnings, status, payment_method, transaction_date, created_at",
          )
          .eq("expert_user_id", userId)
          .in("transaction_type", ["session_booking", "session_extension"])
          .not("booking_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(cap)
      : await admin
          .from("transactions")
          .select(
            "transaction_id, transaction_type, booking_id, expert_user_id, learner_user_id, total_charge, status, payment_method, transaction_date, created_at",
          )
          .or(`learner_user_id.eq.${userId},expert_user_id.eq.${userId}`)
          .in("transaction_type", ["session_booking", "session_extension"])
          .not("booking_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(cap);

    if (error) {
      return Response.json({ error: publicApiError(error) }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as BookingHistoryTxRow[];
    const counterpartIds = [
      ...new Set(
        rows
          .map((r) => (expertEarnings ? r.learner_user_id : r.learner_user_id === userId ? r.expert_user_id : r.learner_user_id))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const users = counterpartIds.length > 0 ? await getUsersByIds(counterpartIds) : [];
    const byId = new Map(users.map((u) => [u.user_id, u]));

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let lifetime = 0;
    let yearToDate = 0;
    let monthToDate = 0;
    let upcoming = 0;

    const transactions = rows.map((r) => {
      const otherId = expertEarnings
        ? (r.learner_user_id as string | null)
        : r.learner_user_id === userId
          ? r.expert_user_id
          : r.learner_user_id;
      const u = otherId ? byId.get(otherId) : undefined;
      const bid = r.booking_id as string;
      const earn = expertEarnings ? Number(r.expert_earnings ?? 0) : Number(r.total_charge);
      const st = String(r.status ?? "").toLowerCase();
      const rowDate = new Date((r.transaction_date ?? r.created_at) as string);
      if (expertEarnings) {
        if (st === "succeeded" && Number.isFinite(earn)) {
          lifetime += earn;
          if (Number.isFinite(rowDate.getTime())) {
            if (rowDate.getFullYear() === y) yearToDate += earn;
            if (rowDate.getFullYear() === y && rowDate.getMonth() === m) monthToDate += earn;
          }
        } else if (st === "pending" && Number.isFinite(earn)) {
          upcoming += earn;
        }
      }
      return {
        id: r.transaction_id,
        bookingId: bid,
        orderRef: bookingOrderRef(bid),
        kind: r.transaction_type === "session_extension" ? "extension" : "session",
        date: (r.transaction_date ?? r.created_at) as string,
        amount: earn,
        status: r.status,
        counterpartyName: u ? displayName(u) : null,
      };
    });

    if (expertEarnings) {
      return Response.json({
        transactions,
        expertEarningsSummary: {
          lifetime,
          yearToDate,
          monthToDate,
          upcoming,
        },
      });
    }

    return Response.json({ transactions });
  }

  const limit = Math.min(Number(searchParams.get("limit") ?? "25") || 25, 50);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("transactions")
    .select(
      "transaction_id, transaction_type, booking_id, package_id, expert_user_id, learner_user_id, total_charge, platform_fee, expert_earnings, status, payment_method, transaction_date, created_at, stripe_checkout_session_id",
    )
    .or(`learner_user_id.eq.${userId},expert_user_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ transactions: data ?? [] });
}

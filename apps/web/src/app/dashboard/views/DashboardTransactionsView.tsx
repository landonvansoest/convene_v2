"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Calendar,
  ChevronDown,
  Clock,
  CreditCard,
  DollarSign,
  Filter,
  Loader2,
  Receipt,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  dashboardViewCardClass,
  dashboardViewContentBoxClass,
  DashboardViewHeader,
} from "@/app/dashboard/DashboardViewShell";
import { ExpertPayoutInformationCard } from "@/app/dashboard/ExpertPayoutInformationCard";

type BookingHistoryRow = {
  id: string;
  bookingId: string;
  orderRef: string;
  kind: string;
  date: string;
  amount: number;
  status: string;
  counterpartyName: string | null;
};

type ExpertEarningsSummary = {
  lifetime: number;
  yearToDate: number;
  monthToDate: number;
  upcoming: number;
};

type PayoutGroup = {
  key: string;
  label: string;
  total: number;
  items: BookingHistoryRow[];
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPayoutHeading(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function monthKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "unknown";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthKey(ym: string): string {
  const [y, mo] = ym.split("-").map((x) => Number(x));
  if (!y || !mo) return ym;
  return new Date(y, mo - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function statusLabel(raw: string): string {
  const s = raw.toLowerCase();
  if (s === "succeeded") return "Paid";
  if (s === "pending") return "Pending";
  if (s === "refunded") return "Refunded";
  if (s === "failed") return "Failed";
  return raw.replace(/_/g, " ");
}

function EarningsStatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#003049]/10 bg-[#FFF6EE]/50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#003049]/65">{title}</span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#F77F00]/15 text-[#F77F00] [&_svg]:h-4 [&_svg]:w-4">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-[#003049]">{value}</p>
      <p className="mt-1 text-xs font-medium text-[#003049]/60">{subtitle}</p>
    </div>
  );
}

export default function DashboardTransactionsView({ mode = "learner" }: { mode?: "learner" | "expert" }) {
  const [rows, setRows] = useState<BookingHistoryRow[]>([]);
  const [expertSummary, setExpertSummary] = useState<ExpertEarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedPayoutKeys, setExpandedPayoutKeys] = useState<Set<string>>(() => new Set());

  const togglePayout = useCallback((key: string) => {
    setExpandedPayoutKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      const url =
        mode === "expert"
          ? "/api/me/transactions?bookingHistory=1&expertEarnings=1&limit=2500"
          : "/api/me/transactions?bookingHistory=1";
      const res = await fetch(url);
      const data = (await res.json()) as {
        transactions?: BookingHistoryRow[];
        expertEarningsSummary?: ExpertEarningsSummary;
        error?: string;
      };
      if (cancelled) return;
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Could not load transactions");
        setRows([]);
        setExpertSummary(null);
      } else {
        setRows(Array.isArray(data.transactions) ? data.transactions : []);
        if (mode === "expert" && data.expertEarningsSummary) {
          setExpertSummary(data.expertEarningsSummary);
        } else {
          setExpertSummary(null);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const payoutGroups = useMemo((): PayoutGroup[] => {
    if (mode !== "expert") return [];
    const succeeded = rows.filter((r) => r.status.toLowerCase() === "succeeded");
    const byMonth = new Map<string, BookingHistoryRow[]>();
    for (const r of succeeded) {
      const k = monthKeyFromIso(r.date);
      const list = byMonth.get(k) ?? [];
      list.push(r);
      byMonth.set(k, list);
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, items]) => ({
        key,
        label: formatMonthKey(key),
        total: items.reduce((s, x) => s + x.amount, 0),
        items: items.sort((a, b) => String(b.date).localeCompare(String(a.date))),
      }));
  }, [rows, mode]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.status.toLowerCase());
    return ["all", ...Array.from(set).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const st = statusFilter === "all" ? null : statusFilter.toLowerCase();
    return rows.filter((r) => {
      if (st && r.status.toLowerCase() !== st) return false;
      if (!q) return true;
      const amountStr = money.format(r.amount).toLowerCase();
      const rawAmount = String(r.amount);
      const name = (r.counterpartyName ?? "").toLowerCase();
      return (
        r.orderRef.toLowerCase().includes(q) ||
        r.bookingId.toLowerCase().includes(q) ||
        name.includes(q) ||
        amountStr.includes(q) ||
        rawAmount.includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  const emptyFromApi = !loading && rows.length === 0 && !err;
  const emptyFromFilter = !loading && rows.length > 0 && filtered.length === 0;

  const summary = expertSummary ?? { lifetime: 0, yearToDate: 0, monthToDate: 0, upcoming: 0 };

  return (
    <div className={dashboardViewCardClass}>
      <DashboardViewHeader
        Icon={DollarSign}
        title={mode === "expert" ? "Earnings" : "Transaction History"}
        subtitle={
          mode === "expert"
            ? "Track your income, payouts, and financial performance."
            : "View and search your payment history"
        }
      />

      {mode === "expert" && !loading && !err ? (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <EarningsStatCard
              title="Lifetime Earnings"
              value={money.format(summary.lifetime)}
              subtitle="Completed bookings (on record)"
              icon={<TrendingUp className="h-4 w-4" aria-hidden />}
            />
            <EarningsStatCard
              title="Year to Date"
              value={money.format(summary.yearToDate)}
              subtitle="This calendar year"
              icon={<Calendar className="h-4 w-4" aria-hidden />}
            />
            <EarningsStatCard
              title="Month to Date"
              value={money.format(summary.monthToDate)}
              subtitle="This calendar month"
              icon={<DollarSign className="h-4 w-4" aria-hidden />}
            />
            <EarningsStatCard
              title="Upcoming"
              value={money.format(summary.upcoming)}
              subtitle="Pending completion"
              icon={<Clock className="h-4 w-4" aria-hidden />}
            />
          </div>

          <div className="rounded-xl border border-[#003049]/10 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#F77F00]/15 text-[#F77F00]">
                <Wallet className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-[#003049]">Account Balance</h2>
                <p className="mt-0.5 text-sm font-medium text-[#003049]/65">
                  Your current balance and next scheduled payout
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-[#003049]/10 bg-[#F3F4F6] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#003049]/65">Available Balance</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-[#F77F00]">{money.format(summary.lifetime)}</p>
                  <p className="mt-1 text-xs font-medium text-[#003049]/55">
                    Total expert earnings from completed bookings in this summary.
                  </p>
                </div>
                <CreditCard className="h-8 w-8 shrink-0 text-[#F77F00]/80" aria-hidden />
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-[#003049]/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#003049]/65">Next Payout Date</p>
                <p className="mt-1 text-sm font-bold text-[#003049]">
                  {summary.upcoming > 0
                    ? "Pending — settlements complete when sessions finish"
                    : "No upcoming payouts"}
                </p>
              </div>
              <Link
                href="/expert/connect"
                className="text-sm font-semibold text-[#F77F00] underline underline-offset-2 hover:text-[#003049]"
              >
                Request Early Payout
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-[#003049]/10 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#F77F00]/15 text-[#F77F00]">
                <DollarSign className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-[#003049]">Payout History</h2>
                <p className="mt-0.5 text-sm font-medium text-[#003049]/65">
                  View your payment history and transaction details
                </p>
              </div>
            </div>
            {payoutGroups.length === 0 ? (
              <p className="mt-6 text-sm font-medium text-[#003049]/60">No payout batches yet.</p>
            ) : (
              <ul className="mt-5 divide-y divide-[#003049]/10 rounded-lg border border-[#003049]/10">
                {payoutGroups.map((g) => {
                  const open = expandedPayoutKeys.has(g.key);
                  const headingDate = g.items[0] ? formatPayoutHeading(g.items[0].date) : g.label;
                  return (
                    <li key={g.key} className="bg-white">
                      <button
                        type="button"
                        onClick={() => togglePayout(g.key)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[#F8FAFC]"
                      >
                        <span className="text-sm font-semibold text-[#003049]">{headingDate}</span>
                        <span className="flex items-center gap-2">
                          <span className="rounded-full bg-[#F77F00]/15 px-2.5 py-0.5 text-xs font-bold text-[#F77F00]">
                            Paid
                          </span>
                          <span className="text-sm font-bold tabular-nums text-[#F77F00]">{money.format(g.total)}</span>
                          <ChevronDown
                            className={cn("h-4 w-4 shrink-0 text-[#003049] transition", open && "rotate-180")}
                            aria-hidden
                          />
                        </span>
                      </button>
                      {open ? (
                        <div className="border-t border-[#003049]/8 bg-[#F8FAFC]/80 px-4 py-3">
                          <ul className="space-y-2 text-[13px]">
                            {g.items.map((r) => (
                              <li
                                key={r.id}
                                className="flex flex-wrap items-center justify-between gap-2 border-b border-[#003049]/5 pb-2 last:border-0 last:pb-0"
                              >
                                <span className="text-[#003049]/80">
                                  {formatWhen(r.date)} · {r.counterpartyName ?? "Learner"} ·{" "}
                                  {r.kind === "extension" ? "Extension" : "Session"}
                                </span>
                                <span className="font-semibold tabular-nums text-[#003049]">{money.format(r.amount)}</span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-3 text-xs font-semibold text-[#003049]/65">
                            Batch total {money.format(g.total)} · {g.items.length} session
                            {g.items.length === 1 ? "" : "s"}
                          </p>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <ExpertPayoutInformationCard />
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#003049]/40"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              mode === "expert"
                ? "Search by order number, learner name, or amount…"
                : "Search by order number, expert name, or amount…"
            }
            className="h-10 border-[#003049]/15 pl-9 text-[13px] text-[#003049] placeholder:text-[#003049]/45"
            aria-label={mode === "expert" ? "Search earnings" : "Search transactions"}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            className="h-10 w-full shrink-0 border-[#003049]/15 sm:w-[180px]"
            aria-label="Filter by status"
          >
            <span className="flex items-center gap-2 text-[13px] text-[#003049]">
              <Filter className="h-3.5 w-3.5 text-[#003049]/50" aria-hidden />
              <SelectValue placeholder="All Statuses" />
            </span>
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s} className="text-[13px]">
                {s === "all" ? "All Statuses" : statusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {mode === "expert" ? (
        <h2 className="mt-8 text-lg font-bold text-[#003049]">All booking transactions</h2>
      ) : null}

      <div className={cn(dashboardViewContentBoxClass, mode === "expert" && "mt-4")}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#003049]/60">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Loading…
          </div>
        ) : err ? (
          <p className="py-12 text-center text-sm text-destructive">{err}</p>
        ) : emptyFromApi ? (
          <div className="flex flex-col items-center py-14 text-center">
            <Receipt className="h-16 w-16 text-[#003049]/20" strokeWidth={1.25} aria-hidden />
            <p className="mt-5 text-base font-bold text-[#003049]">No transactions found</p>
            <p className="mt-2 max-w-sm text-sm font-medium text-[#003049]/60">
              {mode === "expert"
                ? "Session earnings will appear here once learners complete paid bookings."
                : "You haven&apos;t made any bookings yet"}
            </p>
          </div>
        ) : emptyFromFilter ? (
          <div className="flex flex-col items-center py-14 text-center">
            <Receipt className="h-14 w-14 text-[#003049]/20" strokeWidth={1.25} aria-hidden />
            <p className="mt-4 text-base font-bold text-[#003049]">No transactions match</p>
            <p className="mt-2 text-sm font-medium text-[#003049]/60">Try adjusting search or status filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[#003049]/10">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="border-b border-[#003049]/10 bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-wide text-[#003049]/70">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">With</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#003049]/8">
                {filtered.map((r) => (
                  <tr key={r.id} className="bg-white text-[#003049]">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatWhen(r.date)}</td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums">{r.orderRef}</td>
                    <td className="max-w-[200px] truncate px-4 py-3">{r.counterpartyName ?? "—"}</td>
                    <td className="px-4 py-3 capitalize text-[#003049]/85">
                      {r.kind === "extension" ? "Extension" : "Session"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{money.format(r.amount)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                          r.status.toLowerCase() === "succeeded" && "bg-emerald-500/15 text-emerald-800",
                          r.status.toLowerCase() === "pending" && "bg-amber-500/15 text-amber-900",
                          r.status.toLowerCase() === "refunded" && "bg-slate-200 text-slate-800",
                          r.status.toLowerCase() === "failed" && "bg-red-500/15 text-red-900",
                          !["succeeded", "pending", "refunded", "failed"].includes(r.status.toLowerCase()) &&
                            "bg-[#003049]/10 text-[#003049]",
                        )}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

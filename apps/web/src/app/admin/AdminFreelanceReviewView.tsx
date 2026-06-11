"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Person = { user_id: string; first_name: string | null; last_name: string | null; email_address: string | null };

type FreelanceItem = {
  freelance_id: string;
  expert_user_id: string;
  learner_user_id: string;
  total_price: number | string | null;
  work_deadline: string | null;
  expert_grace_end_at: string | null;
  completion_submitted_at: string | null;
  learner_completion_deadline_at: string | null;
  admin_review_at: string | null;
  admin_review_reason: string | null;
  rectification_deadline_at: string | null;
  payment_status: string | null;
  completion_message: string | null;
  completion_attachments: unknown;
  refunded_amount_cents: number | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at: string;
  expert: Person | null;
  learner: Person | null;
};

function nameOf(p: Person | null, fallback: string): string {
  if (!p) return fallback;
  const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return name || p.email_address || fallback;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AdminFreelanceReviewView({
  onCountsChanged,
}: {
  onCountsChanged?: () => void;
}) {
  const [items, setItems] = useState<FreelanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/freelance-review", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load");
      setItems((data.items as FreelanceItem[]) ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function resolve(id: string, resolution: "complete" | "refund") {
    const note = window.prompt(
      resolution === "complete"
        ? "Optional resolution note (released to expert):"
        : "Optional resolution note (refund to learner):",
    );
    if (note === null) return; // user cancelled
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/freelance-review/${encodeURIComponent(id)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, note: note || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to resolve");
      onCountsChanged?.();
      await refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to resolve");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="border-2 border-[#003049]/10 shadow-sm">
      <CardHeader>
        <CardTitle>Freelance — admin review</CardTitle>
        <p className="text-sm text-muted-foreground">
          Disputed and missed-deadline freelance jobs awaiting an admin decision. Resolve to
          either release payout to the expert or refund the learner.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : err ? (
          <p className="text-sm text-red-600">{err}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing in admin review.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((row) => (
              <li
                key={row.freelance_id}
                className="rounded-md border border-[#003049]/15 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#003049]">
                      {nameOf(row.expert, "Expert")} → {nameOf(row.learner, "Learner")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ${Number(row.total_price ?? 0).toFixed(2)} · payment{" "}
                      {row.payment_status ?? "?"} · in review since {fmtDate(row.admin_review_at)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Work deadline {fmtDate(row.work_deadline)} · grace until{" "}
                      {fmtDate(row.expert_grace_end_at)} · rectification due{" "}
                      {fmtDate(row.rectification_deadline_at)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      disabled={busyId === row.freelance_id}
                      onClick={() => void resolve(row.freelance_id, "complete")}
                    >
                      Release payout
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busyId === row.freelance_id}
                      onClick={() => void resolve(row.freelance_id, "refund")}
                    >
                      Refund learner
                    </Button>
                  </div>
                </div>
                {row.admin_review_reason ? (
                  <p className="mt-2 text-sm text-[#003049]/80">
                    <span className="font-medium">Reason:</span> {row.admin_review_reason}
                  </p>
                ) : null}
                {row.completion_message ? (
                  <p className="mt-2 text-sm text-[#003049]/80">
                    <span className="font-medium">Expert note:</span> {row.completion_message}
                  </p>
                ) : null}
                {row.stripe_payment_intent_id ? (
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                    PI: {row.stripe_payment_intent_id}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

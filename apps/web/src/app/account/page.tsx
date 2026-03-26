"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type SubRow = {
  subscription_id: string;
  stripe_subscription_id: string | null;
  plan_id: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
};

type CreditRow = {
  credit_id: string;
  package_id: string;
  package_title: string | null;
  remaining_credits: number;
  expiration_at: string | null;
};

type TxRow = {
  transaction_id: string;
  transaction_type: string;
  total_charge: number;
  platform_fee: number;
  expert_earnings: number;
  status: string;
  payment_method: string | null;
  transaction_date: string | null;
  created_at: string;
};

export default function AccountPage() {
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalErr, setPortalErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [sRes, cRes, tRes] = await Promise.all([
        fetch("/api/me/subscription"),
        fetch("/api/me/package-credits"),
        fetch("/api/me/transactions?limit=25"),
      ]);
      const sData = await sRes.json();
      const cData = await cRes.json();
      const tData = await tRes.json();
      if (cancelled) return;
      if (!sRes.ok) {
        setErr(typeof sData.error === "string" ? sData.error : "Failed to load");
        setSubs([]);
      } else {
        setErr(null);
        setSubs((sData.subscriptions as SubRow[]) ?? []);
      }
      if (cRes.ok) setCredits((cData.credits as CreditRow[]) ?? []);
      else setCredits([]);
      if (tRes.ok) setTxs((tData.transactions as TxRow[]) ?? []);
      else setTxs([]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function openPortal() {
    setPortalBusy(true);
    setPortalErr(null);
    const res = await fetch("/api/stripe/customer-portal", { method: "POST" });
    const data = await res.json();
    setPortalBusy(false);
    if (!res.ok) {
      setPortalErr(typeof data.error === "string" ? data.error : "Portal failed");
      return;
    }
    if (data.url) window.location.href = data.url as string;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container mx-auto max-w-2xl px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#003049]">Account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Billing, subscriptions, and transaction history (v1-style layout).
          </p>
        </div>

        {err ? (
          <p className="mb-6 text-sm text-destructive">
            {err}{" "}
            <Link href="/login" className="underline">
              Sign in
            </Link>
          </p>
        ) : null}

        <Card className="border-2 border-[#003049]/15">
          <CardHeader>
            <CardTitle className="text-[#003049]">Stripe customer portal</CardTitle>
            <CardDescription>Payment methods, invoices, cancellation — per your Stripe settings.</CardDescription>
          </CardHeader>
          <CardContent>
            {portalErr ? <p className="mb-2 text-sm text-destructive">{portalErr}</p> : null}
            <Button
              type="button"
              disabled={portalBusy}
              onClick={() => void openPortal()}
              className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
            >
              {portalBusy ? "Opening…" : "Manage billing"}
            </Button>
          </CardContent>
        </Card>

        <Card className="mt-6 border-[#003049]/10">
          <CardHeader>
            <CardTitle className="text-[#003049]">Package credits</CardTitle>
          </CardHeader>
          <CardContent>
            {credits.length === 0 ? (
              <p className="text-sm text-muted-foreground">None on file.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {credits.map((c) => (
                  <li key={c.credit_id} className="rounded-lg border bg-white/80 px-4 py-2">
                    {c.package_title ?? c.package_id} · {c.remaining_credits} left
                    {c.expiration_at ? <> · exp {c.expiration_at}</> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6 border-[#003049]/10">
          <CardHeader>
            <CardTitle className="text-[#003049]">Transactions</CardTitle>
            <CardDescription>Recent ledger rows where you are learner or expert.</CardDescription>
          </CardHeader>
          <CardContent>
            {txs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {txs.map((t) => (
                  <li key={t.transaction_id} className="rounded-lg border px-4 py-3">
                    <span className="font-medium text-[#003049]">{t.transaction_type}</span>
                    <span className="text-muted-foreground"> · </span>
                    <span>${Number(t.total_charge).toFixed(2)}</span>
                    {t.payment_method ? (
                      <span className="text-muted-foreground"> · {t.payment_method}</span>
                    ) : null}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t.transaction_date ?? t.created_at} · {t.status}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6 border-[#003049]/10">
          <CardHeader>
            <CardTitle className="text-[#003049]">Expert subscription</CardTitle>
            <CardDescription>Synced from Stripe webhooks.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : subs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None yet.{" "}
                <Link href="/subscribe" className="font-medium text-[#003049] underline">
                  Subscribe
                </Link>
              </p>
            ) : (
              <ul className="space-y-3 text-sm">
                {subs.map((s) => (
                  <li key={s.subscription_id} className="rounded-lg border px-4 py-3">
                    <div className="font-medium capitalize">{s.status}</div>
                    <div className="mt-1 text-muted-foreground">
                      Plan: {s.plan_id ?? "—"} · Stripe: {s.stripe_subscription_id ?? "—"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {s.current_period_start ? `${s.current_period_start} → ` : ""}
                      {s.current_period_end ?? ""}
                      {s.cancel_at_period_end ? " · ends at period end" : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Separator className="my-8" />
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/profile" className="text-[#003049] underline">
            Edit profile
          </Link>
          {" · "}
          <Link href="/dashboard" className="text-[#003049] underline">
            Dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Crown, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  dashboardViewCardClass,
  dashboardViewContentBoxClass,
  DashboardViewHeader,
} from "@/app/dashboard/DashboardViewShell";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { membershipTiers } from "@/lib/expert-registration";

type MembershipTier = (typeof membershipTiers)[number];

function WizardSectionHeading({ Icon, children }: { Icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h3 className="flex items-start gap-2.5 text-lg font-bold text-[#003049] sm:gap-3 sm:text-xl">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#F77F00] sm:h-6 sm:w-6" strokeWidth={2} aria-hidden />
      <span>{children}</span>
    </h3>
  );
}

const wizardSectionBodyClass =
  "mt-2 text-[13px] font-medium leading-snug text-[#003049]/90 sm:mt-2.5 sm:text-sm";

const manualInputClass =
  "h-9 text-[13px] leading-snug font-normal text-[#003049] placeholder:text-[#003049]";
const manualTextareaClass =
  "min-h-[88px] text-[13px] leading-snug font-normal text-[#003049] placeholder:text-[#003049]";

export default function DashboardExpertStatusView() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tier, setTier] = useState<MembershipTier>("free");
  const [selectedPlan, setSelectedPlan] = useState<MembershipTier>("free");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [verifiedOpen, setVerifiedOpen] = useState(false);
  const [subBusy, setSubBusy] = useState(false);

  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
  const [enterpriseSending, setEnterpriseSending] = useState(false);
  const [enterpriseForm, setEnterpriseForm] = useState({
    message: "",
    coach_count: "",
    best_time: "",
    email: "",
    phone: "",
  });

  const reload = useCallback(async () => {
    setErr(null);
    const res = await fetch("/api/experts/registration-draft");
    const data = (await res.json()) as {
      profile?: { membership_tier?: string; email?: string; phone_number?: string | null } | null;
      error?: string;
    };
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Could not load");
      return;
    }
    const p = data.profile;
    const t = p?.membership_tier;
    if (t === "verified" || t === "enterprise" || t === "free") setTier(t);
    setEmail(String(p?.email ?? ""));
    setPhone(String(p?.phone_number ?? ""));
  }, []);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      await reload();
      if (!c) setLoading(false);
    })();
    return () => {
      c = true;
    };
  }, [reload]);

  useEffect(() => {
    setSelectedPlan(tier);
  }, [tier]);

  async function persistTier(next: MembershipTier) {
    setErr(null);
    const res = await fetch("/api/me/expert-membership-tier", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membership_tier: next }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Could not update plan");
      return;
    }
    setTier(next);
    setSelectedPlan(next);
  }

  async function submitStatusChange() {
    const canResubmitSame =
      selectedPlan === "verified" || selectedPlan === "enterprise";
    if (selectedPlan === tier && !canResubmitSame) return;
    if (selectedPlan === "verified") {
      setVerifiedOpen(true);
      return;
    }
    if (selectedPlan === "enterprise") {
      setEnterpriseForm((f) => ({ ...f, email: email || f.email, phone: phone || f.phone }));
      setEnterpriseOpen(true);
      return;
    }
    setSubmitBusy(true);
    try {
      await persistTier("free");
    } finally {
      setSubmitBusy(false);
    }
  }

  async function startVerifiedCheckout() {
    setSubBusy(true);
    try {
      const res = await fetch("/api/stripe/create-subscription-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : "Could not start checkout");
        return;
      }
      const url = typeof json.url === "string" ? json.url : "";
      if (url) window.location.href = url;
    } finally {
      setSubBusy(false);
      setVerifiedOpen(false);
    }
  }

  async function sendEnterpriseInquiry() {
    setEnterpriseSending(true);
    setErr(null);
    try {
      const res = await fetch("/api/user-feedback/enterprise-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: enterpriseForm.message.trim(),
          coach_count: enterpriseForm.coach_count.trim(),
          best_time_to_contact: enterpriseForm.best_time.trim(),
          email: enterpriseForm.email.trim() || email,
          phone: enterpriseForm.phone.trim() || phone,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : "Could not send message");
        return;
      }
      setEnterpriseOpen(false);
      setEnterpriseForm((f) => ({ ...f, message: "" }));
      await persistTier("enterprise");
    } finally {
      setEnterpriseSending(false);
    }
  }

  const tierCardBase =
    "flex flex-col rounded-2xl border-2 border-[#003049]/15 bg-[#F8FAFC] p-5 text-left shadow-sm transition-colors";
  const checkClass = "mt-0.5 h-4 w-4 shrink-0 text-[#003049]";
  const tiers: {
    id: MembershipTier;
    name: string;
    price: string;
    blurb: string;
    highlight?: boolean;
    features: string[];
  }[] = [
    {
      id: "free",
      name: "Free",
      price: "$0",
      blurb: "Everything You Need to Start Coaching",
      features: [
        "Expert profile",
        "Scheduling and Booking System",
        "User messaging",
        "Community Request access",
        "Booking Analytics",
        "Customer support",
      ],
    },
    {
      id: "verified",
      name: "Verified",
      price: "$15",
      blurb: "By undergoing our verification process, Experts gain enhanced visibility and credibility in our community.",
      highlight: true,
      features: [
        "Verified expert badge",
        "Priority search results",
        "Priority customer support",
        "Marketing tools",
        "Everything included in Free",
      ],
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: "Custom Pricing",
      blurb: "Full-featured solution for established coaching businesses and B2B applications",
      features: [
        "Multiple Verified Experts",
        "Dedicated account manager",
        "Custom branding",
        "Advanced integrations",
        "White-label options",
        "Priority feature requests",
        "24/7 phone support",
        "Custom training sessions",
        "API access",
      ],
    },
  ];

  if (loading) {
    return (
      <div className={dashboardViewCardClass}>
        <p className="text-sm text-muted-foreground">Loading expert status…</p>
      </div>
    );
  }

  const submitDisabled =
    (selectedPlan === tier && selectedPlan !== "verified" && selectedPlan !== "enterprise") || submitBusy;

  return (
    <div className={dashboardViewCardClass}>
      {err ? <p className="mb-3 text-sm text-red-600">{err}</p> : null}
      <DashboardViewHeader Icon={Crown} title="Expert Status" />

      <div className="mt-6 rounded-xl border border-[#003049]/10 bg-[#FFF6EE]/45 p-4 sm:p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#003049]/70">Current Expert Status</h2>
        <p className="mt-1.5 text-lg font-bold capitalize text-[#003049]">{tier}</p>
      </div>

      <div className={dashboardViewContentBoxClass}>
        <WizardSectionHeading Icon={Crown}>Update Your Status</WizardSectionHeading>
        <p className={wizardSectionBodyClass}>Coaching on convene is always free.</p>
        <p className={cn(wizardSectionBodyClass, "mt-2")}>
          By upgrading to a &quot;verified&quot; account, we can offer more services, help bring you more bookings, and
          build more trust in our community.
        </p>
        <div className="mt-5 grid gap-4 sm:mt-6 md:grid-cols-3">
          {tiers.map((t) => {
            const isCurrent = tier === t.id;
            const isPicked = selectedPlan === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedPlan(t.id)}
                className={cn(
                  tierCardBase,
                  t.highlight && "border-[#F77F00] ring-2 ring-[#F77F00]/20",
                  isPicked && "ring-2 ring-[#F77F00] ring-offset-2",
                  isCurrent && "border-[#003049]/35",
                )}
              >
                {t.highlight ? (
                  <span className="mb-3 self-center rounded-full bg-[#F77F00] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white sm:text-xs">
                    Most Popular
                  </span>
                ) : (
                  <span className="mb-3 h-[26px] shrink-0 sm:h-[28px]" aria-hidden />
                )}
                <div className="mb-3 text-center">
                  <p className="text-lg font-bold text-[#003049] sm:text-xl">{t.name}</p>
                  <p className="mt-2 text-2xl font-extrabold text-[#003049]">{t.price}</p>
                  {t.id === "verified" ? (
                    <p className="mt-1 text-xs font-medium text-[#003049]/65">per month</p>
                  ) : null}
                </div>
                <p className="mb-4 text-center text-[13px] font-medium leading-snug text-[#003049]/85">{t.blurb}</p>
                <ul className="flex flex-col gap-2 text-left text-[13px] font-medium text-[#003049]">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className={checkClass} strokeWidth={2.5} aria-hidden />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-col gap-1 text-center">
                  {isCurrent ? (
                    <p className="text-xs font-bold uppercase tracking-wide text-[#F77F00]">Current</p>
                  ) : null}
                  {isPicked ? (
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#003049]/70">Selected</p>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-8 flex justify-center">
          <Button
            type="button"
            disabled={submitDisabled}
            className="min-w-[200px] bg-[#F77F00] font-bold text-white hover:bg-[#e07400] disabled:opacity-50"
            onClick={() => void submitStatusChange()}
          >
            {submitBusy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Updating…
              </>
            ) : (
              "Submit"
            )}
          </Button>
        </div>
      </div>

      <Dialog open={verifiedOpen} onOpenChange={setVerifiedOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#003049]">Verified membership</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-[#003049]/90">
            The Verified plan is <span className="font-semibold">$15/month</span>. Continue to secure checkout to add
            subscription billing to your account.
          </p>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              className="bg-[#F77F00] font-bold text-white hover:bg-[#e07400]"
              disabled={subBusy}
              onClick={() => void startVerifiedCheckout()}
            >
              {subBusy ? "Starting…" : "Continue to payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={enterpriseOpen} onOpenChange={setEnterpriseOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#003049]">Contact us</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-[#003049]/90">
            We welcome the opportunity to partner with companies and organizations and are excited to discuss our services.
            Please tell us about your organization below and a specialist will contact you shortly.
          </p>
          <div className="grid gap-3 py-2">
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Message</Label>
              <Textarea
                rows={4}
                value={enterpriseForm.message}
                onChange={(e) => setEnterpriseForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="Tell us about your organization and goals"
                className={manualTextareaClass}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Number of Coaches on Your Team</Label>
              <Input
                value={enterpriseForm.coach_count}
                onChange={(e) => setEnterpriseForm((f) => ({ ...f, coach_count: e.target.value }))}
                className={manualInputClass}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Best time to contact you</Label>
              <Input
                value={enterpriseForm.best_time}
                onChange={(e) => setEnterpriseForm((f) => ({ ...f, best_time: e.target.value }))}
                placeholder="e.g. Weekdays 9am–5pm ET"
                className={manualInputClass}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Email</Label>
              <Input
                type="email"
                value={enterpriseForm.email}
                onChange={(e) => setEnterpriseForm((f) => ({ ...f, email: e.target.value }))}
                className={manualInputClass}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-[#003049]">Phone number</Label>
              <Input
                value={enterpriseForm.phone}
                onChange={(e) => setEnterpriseForm((f) => ({ ...f, phone: e.target.value }))}
                className={manualInputClass}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEnterpriseOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#F77F00] font-bold text-white hover:bg-[#e07400]"
              disabled={enterpriseSending || enterpriseForm.message.trim().length < 10}
              onClick={() => void sendEnterpriseInquiry()}
            >
              {enterpriseSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Sending…
                </>
              ) : (
                "Send"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

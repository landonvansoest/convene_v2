"use client";

import { useRouter } from "next/navigation";
import { Calendar, DollarSign, Mail, MessageSquare } from "lucide-react";

export type DashboardSummaryJson = {
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    profilePhoto: string | null;
    online: boolean;
    sessionsBooked: number;
    sessionsCompleted: number;
    learnerDependabilityRating: number | null;
    hasExpertProfile: boolean;
  };
  expert: {
    expertProfileId: string;
    completeSessions: number;
    expertDependabilityRating: number | null;
    categoryId: string | null;
  } | null;
  ratings: {
    asLearnerAvg: number | null;
    asExpertAvg: number | null;
  };
  counts: {
    upcomingSessions: number;
    unreadMessages: number;
    expertNewBookings: number;
    learnerUnseenRequestResponses: number;
    expertCommunityRequests: number;
  };
  earningsThisMonth: number;
  actionItems: Array<{ id: string; label: string; href: string }>;
};

function StatCard({
  title,
  value,
  subtitle,
  onClick,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-stretch rounded-lg border-2 border-[#003049]/10 bg-white p-4 text-left shadow-sm transition hover:border-[#003049]/25 focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#F77F00]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        <span className="text-[#003049]/60">{icon}</span>
      </div>
      <span className="mt-3 text-2xl font-semibold tabular-nums text-[#003049]">{value}</span>
      <span className="mt-1 text-xs text-muted-foreground">{subtitle}</span>
    </button>
  );
}

export function DashboardOverview({ summary }: { summary: DashboardSummaryJson }) {
  const router = useRouter();
  const { profile, counts, earningsThisMonth, actionItems } = summary;
  const isExpert = profile.hasExpertProfile;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#003049]">
          Welcome back{profile.firstName ? `, ${profile.firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Snapshot of your account — v1-style dashboard shell.
        </p>
      </div>

      <div
        className={
          isExpert
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            : "grid grid-cols-1 gap-3 sm:grid-cols-3"
        }
      >
        <StatCard
          title="Upcoming sessions"
          value={String(counts.upcomingSessions)}
          subtitle="Paid & scheduled ahead"
          onClick={() => router.push("/dashboard?view=sessions")}
          icon={<Calendar className="h-4 w-4" />}
        />
        <StatCard
          title="Unread messages"
          value={String(counts.unreadMessages)}
          subtitle="Inbox & approvals"
          onClick={() => router.push("/dashboard?view=inbox")}
          icon={<Mail className="h-4 w-4" />}
        />
        {isExpert ? (
          <StatCard
            title="Community requests"
            value={String(counts.expertCommunityRequests)}
            subtitle="In your category (not archived)"
            onClick={() => router.push("/dashboard?view=community-requests")}
            icon={<MessageSquare className="h-4 w-4" />}
          />
        ) : (
          <StatCard
            title="Active requests"
            value={String(counts.learnerUnseenRequestResponses)}
            subtitle="Unread expert responses"
            onClick={() => router.push("/dashboard?view=requests")}
            icon={<MessageSquare className="h-4 w-4" />}
          />
        )}
        {isExpert ? (
          <StatCard
            title="Total earnings"
            value={new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(earningsThisMonth)}
            subtitle="This month"
            onClick={() => router.push("/account")}
            icon={<DollarSign className="h-4 w-4" />}
          />
        ) : null}
      </div>

      <div className="rounded-xl border-2 border-[#003049]/10 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#F77F00]">Action required</h2>
        {actionItems.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">You’re all caught up.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {actionItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => router.push(item.href)}
                  className="w-full rounded-md border border-border bg-muted/40 px-4 py-3 text-left text-sm transition hover:bg-muted focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#F77F00]"
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

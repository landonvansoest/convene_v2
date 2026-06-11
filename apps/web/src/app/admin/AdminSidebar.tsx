"use client";

import type { ReactNode } from "react";
import {
  Banknote,
  Briefcase,
  HelpCircle,
  LayoutGrid,
  LifeBuoy,
  MessageSquare,
  Send,
  Shield,
  Tag,
  Type,
  Users,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export type AdminView =
  | "expert-registrations"
  | "refunds"
  | "freelance-review"
  | "help-tickets"
  | "user-feedback"
  | "membership-tiers"
  | "featured"
  | "categories"
  | "website-text"
  | "faq"
  | "message-templates"
  | "dev-tools";

export type AdminSidebarCounts = {
  expertRegistrations: number;
  bookingProblems: number;
  freelanceAdminReview: number;
  helpTickets: number;
  userFeedback: number;
};

type Entry = { key: AdminView; label: string; icon: ReactNode };
type Section = { heading: string; entries: Entry[] };

const SECTIONS: Section[] = [
  {
    heading: "User Review",
    entries: [
      {
        key: "expert-registrations",
        label: "Expert Registrations",
        icon: <Users className="h-4 w-4 shrink-0 text-[#F77F00]" />,
      },
      {
        key: "refunds",
        label: "Booking Problems",
        icon: <Banknote className="h-4 w-4 shrink-0 text-[#F77F00]" />,
      },
      {
        key: "freelance-review",
        label: "Freelance Review",
        icon: <Briefcase className="h-4 w-4 shrink-0 text-[#F77F00]" />,
      },
      {
        key: "help-tickets",
        label: "Help Tickets",
        icon: <LifeBuoy className="h-4 w-4 shrink-0 text-[#F77F00]" />,
      },
      {
        key: "user-feedback",
        label: "User Feedback",
        icon: <MessageSquare className="h-4 w-4 shrink-0 text-[#F77F00]" />,
      },
      {
        key: "membership-tiers",
        label: "Membership Tier Overrides",
        icon: <Shield className="h-4 w-4 shrink-0 text-[#F77F00]" />,
      },
    ],
  },
  {
    heading: "Website CMS",
    entries: [
      {
        key: "featured",
        label: "Featured Expert Grid",
        icon: <LayoutGrid className="h-4 w-4 shrink-0 text-[#F77F00]" />,
      },
      {
        key: "categories",
        label: "Categories",
        icon: <Tag className="h-4 w-4 shrink-0 text-[#F77F00]" />,
      },
      {
        key: "website-text",
        label: "Website Text Update",
        icon: <Type className="h-4 w-4 shrink-0 text-[#F77F00]" />,
      },
      {
        key: "faq",
        label: "FAQ Edit",
        icon: <HelpCircle className="h-4 w-4 shrink-0 text-[#F77F00]" />,
      },
      {
        key: "message-templates",
        label: "Message Templates",
        icon: <Send className="h-4 w-4 shrink-0 text-[#F77F00]" />,
      },
      {
        key: "dev-tools",
        label: "DEV Tools",
        icon: <Wrench className="h-4 w-4 shrink-0 text-[#F77F00]" />,
      },
    ],
  },
];

export const ADMIN_VIEW_LABELS: Record<AdminView, string> = Object.fromEntries(
  SECTIONS.flatMap((s) => s.entries.map((e) => [e.key, e.label]))
) as Record<AdminView, string>;

export const DEFAULT_ADMIN_VIEW: AdminView = "expert-registrations";

function SidebarRow({
  active,
  icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      className="h-auto min-h-9 w-full justify-start gap-2 whitespace-normal rounded-md px-3 py-2 text-left text-sm"
      onClick={onClick}
    >
      {icon}
      <span className="flex-1 truncate text-left">{label}</span>
      {typeof badge === "number" && badge > 0 ? (
        <span className="shrink-0 rounded-full bg-[#F77F00] px-2 py-0.5 text-xs font-semibold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Button>
  );
}

function badgeForEntry(
  key: AdminView,
  counts: AdminSidebarCounts | null,
): number | undefined {
  if (!counts) return undefined;
  if (key === "expert-registrations") return counts.expertRegistrations;
  if (key === "refunds") return counts.bookingProblems;
  if (key === "freelance-review") return counts.freelanceAdminReview;
  if (key === "help-tickets") return counts.helpTickets;
  if (key === "user-feedback") return counts.userFeedback;
  return undefined;
}

export function AdminSidebar({
  view,
  onSelect,
  adminEmail,
  counts,
}: {
  view: AdminView;
  onSelect: (next: AdminView) => void;
  adminEmail: string;
  counts: AdminSidebarCounts | null;
}) {
  return (
    <aside className="w-56 shrink-0 border-r border-[#003049]/12 bg-white sm:w-64 lg:w-72 min-h-[calc(100dvh-5rem)]">
      <div className="flex flex-col gap-5 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-[#003049]">
          <Shield className="h-6 w-6 text-[#F77F00]" />
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight">Admin</p>
            <p className="truncate text-xs text-muted-foreground">{adminEmail}</p>
          </div>
        </div>

        <nav className="space-y-5">
          {SECTIONS.map((section) => (
            <div key={section.heading} className="space-y-1">
              <p className="px-2 text-xs font-semibold uppercase tracking-wide text-[#003049]/60">
                {section.heading}
              </p>
              <div className="space-y-0.5">
                {section.entries.map((entry) => (
                  <SidebarRow
                    key={entry.key}
                    active={view === entry.key}
                    icon={entry.icon}
                    label={entry.label}
                    badge={badgeForEntry(entry.key, counts)}
                    onClick={() => onSelect(entry.key)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}

"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  ImageIcon,
  LayoutGrid,
  Loader2,
  LogOut,
  Plus,
  Shield,
  Tag,
  Type,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { AdminMessageTemplatesView } from "@/app/admin/AdminMessageTemplatesView";
import {
  AdminSidebar,
  ADMIN_VIEW_LABELS,
  DEFAULT_ADMIN_VIEW,
  type AdminSidebarCounts,
  type AdminView,
} from "./AdminSidebar";
import { AdminHelpTicketsView } from "./AdminHelpTicketsView";
import { AdminFreelanceReviewView } from "./AdminFreelanceReviewView";
import { buildBookingScheduleVars } from "@/lib/notifications/booking-template-vars";
import {
  renderMessageTemplate,
  TEMPLATE_FALLBACKS,
} from "@/lib/notifications/message-templates";

type AdminCat = {
  category_id: string;
  name: string;
  icon: string | null;
  is_active: boolean;
  display_order: number;
  subcategories: string[];
};

type CatDraft = {
  name: string;
  icon: string | null;
  is_active: boolean;
  subcategories: string[];
  subInput: string;
  saving: boolean;
  uploading: boolean;
  error: string | null;
};

type RowSubDraft = {
  input: string;
  uploading: boolean;
};

type FaqRow = {
  faq_id: string;
  question: string;
  answer: string;
  display_order: number;
  is_published: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type FaqDraft = {
  question: string;
  answer: string;
  saving: boolean;
  error: string | null;
};

type SiteTextBlock = {
  block_id: string;
  page_slug: string;
  block_key: string;
  label: string;
  content: string;
  display_order: number;
  updated_at: string | null;
};

const PAGE_LABELS: Record<string, string> = {
  about: "About",
  footer: "Footer",
};

function pageLabel(slug: string): string {
  return (
    PAGE_LABELS[slug] ??
    slug
      .split(/[-_]/g)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ")
  );
}

type DevToolEntry = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
};

type Pending = {
  user_id: string;
  name: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  experience_level: string | null;
  category: string | null;
  category_id: string | null;
  qualifications: string | null;
  expert_bio: string | null;
  about_services: string | null;
  skills_specializations: string[];
  expert_visibility_state: string | null;
  membership_tier: "free" | "verified" | "enterprise";
  registration_submitted_at: string | null;
};

type FeedbackRow = {
  feedback_id: string;
  user_id: string | null;
  feedback_type: string;
  feedback_text: string;
  context: unknown;
  created_at: string;
  booking_id: string | null;
  user_email: string | null;
  user_name: string | null;
};

type TierOverrideRow = {
  user_id: string;
  email: string | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  membership_tier: "free" | "verified" | "enterprise";
  membership_price_override_cents: number | null;
  membership_override_expires_at: string | null;
  updated_at: string | null;
};

type BookingProblemSource = "no_show" | "complaint";

type RefundQueueItem = {
  booking_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  duration: string | null;
  booking_amount: number;
  total_amount: number;
  stripe_payment_intent_id: string | null;
  refunded_amount_cents: number;
  refund_review_status: string | null;
  status: string | null;
  learner_user_id: string | null;
  learner_email: string | null;
  learner_name: string | null;
  expert_email: string | null;
  expert_name: string | null;
  // Complaint-only fields (present when source === "complaint").
  feedback_id?: string;
  feedback_type?: string;
  feedback_text?: string;
  feedback_created_at?: string;
  feedback_author_name?: string | null;
  feedback_author_email?: string | null;
};

type RefundRowInput = {
  /** Amount in dollars; empty string means "full refund". */
  amount: string;
  /** Admin message sent to the learner. */
  message: string;
};

type Props = {
  adminEmail: string;
};

/** Format an interval ("HH:MM:SS") or fall back to start/end diff. */
function formatDuration(
  interval: string | null | undefined,
  startTime?: string,
  endTime?: string,
): string {
  const parse = (val: string | null | undefined) => {
    if (!val) return null;
    const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.\d+)?$/.exec(val);
    if (!m) return null;
    const hh = Number(m[1] ?? 0);
    const mm = Number(m[2]);
    return hh * 60 + mm;
  };
  let minutes: number | null = parse(interval);
  if (minutes == null && startTime && endTime) {
    const s = parse(startTime);
    const e = parse(endTime);
    if (s != null && e != null && e >= s) minutes = e - s;
  }
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function complaintLabel(type: string): string {
  switch (type) {
    case "session_technical_interruption":
      return "Technical interruption";
    case "expert_late_to_join":
      return "Expert late";
    case "learner_late_to_join":
      return "Learner late";
    case "expert_did_not_join_session":
      return "Expert no-show";
    case "learner_did_not_join_session":
      return "Learner no-show";
    default:
      return type.replace(/_/g, " ");
  }
}

export function AdminDashboardClient({ adminEmail }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [view, setView] = useState<AdminView>(DEFAULT_ADMIN_VIEW);
  const [sidebarCounts, setSidebarCounts] = useState<AdminSidebarCounts | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [expandedPending, setExpandedPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [categories, setCategories] = useState<AdminCat[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catErr, setCatErr] = useState<string | null>(null);
  const [catMsg, setCatMsg] = useState<string | null>(null);
  const [catDraft, setCatDraft] = useState<CatDraft | null>(null);
  const [catRowSubDrafts, setCatRowSubDrafts] = useState<Record<string, RowSubDraft>>({});

  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [faqLoading, setFaqLoading] = useState(false);
  const [faqErr, setFaqErr] = useState<string | null>(null);
  const [faqMsg, setFaqMsg] = useState<string | null>(null);
  const [faqDraft, setFaqDraft] = useState<FaqDraft | null>(null);

  const [siteTextBlocks, setSiteTextBlocks] = useState<SiteTextBlock[]>([]);
  const [siteTextLoading, setSiteTextLoading] = useState(false);
  const [siteTextErr, setSiteTextErr] = useState<string | null>(null);
  const [siteTextMsg, setSiteTextMsg] = useState<string | null>(null);
  const [siteTextExpandedPage, setSiteTextExpandedPage] = useState<string | null>("about");
  const [siteTextEditing, setSiteTextEditing] = useState<{
    blockId: string;
    content: string;
    saving: boolean;
    error: string | null;
  } | null>(null);


  const [devTools, setDevTools] = useState<DevToolEntry[]>([]);
  const [devToolsLoading, setDevToolsLoading] = useState(false);
  const [devToolsErr, setDevToolsErr] = useState<string | null>(null);
  const [devToolsPending, setDevToolsPending] = useState<Record<string, boolean>>({});

  const sortedCategories = useMemo(() => {
    const byActive = (a: AdminCat, b: AdminCat) => Number(b.is_active) - Number(a.is_active);
    const byOrder = (a: AdminCat, b: AdminCat) => a.display_order - b.display_order;
    const byName = (a: AdminCat, b: AdminCat) => a.name.localeCompare(b.name);
    return [...categories].sort((a, b) => byActive(a, b) || byOrder(a, b) || byName(a, b));
  }, [categories]);

  const siteTextPages = useMemo(() => {
    const grouped = new Map<string, SiteTextBlock[]>();
    for (const block of siteTextBlocks) {
      const list = grouped.get(block.page_slug) ?? [];
      list.push(block);
      grouped.set(block.page_slug, list);
    }
    const out = Array.from(grouped.entries()).map(([slug, blocks]) => ({
      slug,
      label: pageLabel(slug),
      blocks: blocks
        .slice()
        .sort(
          (a, b) =>
            a.display_order - b.display_order || a.label.localeCompare(b.label),
        ),
    }));
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [siteTextBlocks]);

  const [featLoading, setFeatLoading] = useState(false);
  const [featErr, setFeatErr] = useState<string | null>(null);
  const [featMsg, setFeatMsg] = useState<string | null>(null);
  const [featIncludeTemp, setFeatIncludeTemp] = useState(true);
  const [featIncludePending, setFeatIncludePending] = useState(false);
  const [featMinSessions, setFeatMinSessions] = useState("");
  const [featRequireVerified, setFeatRequireVerified] = useState(false);
  const [featMinRating, setFeatMinRating] = useState("");
  const [featRequireProfilePicture, setFeatRequireProfilePicture] = useState(true);
  const [tierUserId, setTierUserId] = useState("");
  const [tierValue, setTierValue] = useState<"free" | "verified" | "enterprise">("free");
  /** Custom rate as a dollars string; empty = no override. Converted to cents on save. */
  const [tierRateDollars, setTierRateDollars] = useState("");
  /** ISO date ("YYYY-MM-DD") for the expiration picker; empty = indefinite. */
  const [tierExpiresDate, setTierExpiresDate] = useState("");
  const [tierMsg, setTierMsg] = useState<string | null>(null);
  const [tierErr, setTierErr] = useState<string | null>(null);
  const [tierOverrides, setTierOverrides] = useState<TierOverrideRow[]>([]);
  const [tierListLoading, setTierListLoading] = useState(false);
  const [tierListErr, setTierListErr] = useState<string | null>(null);
  const [tierLookupLoading, setTierLookupLoading] = useState(false);
  const [tierLookupInfo, setTierLookupInfo] = useState<{
    user_id: string;
    name: string | null;
    email: string | null;
    has_expert_profile: boolean;
    updated_at: string | null;
  } | null>(null);

  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackErr, setFeedbackErr] = useState<string | null>(null);

  const [refundQueue, setRefundQueue] = useState<RefundQueueItem[]>([]);
  const [refundSource, setRefundSource] = useState<BookingProblemSource>("no_show");
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundErr, setRefundErr] = useState<string | null>(null);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);
  /** Keyed by booking_id (no-show) or feedback_id (complaint). */
  const [refundRowInputs, setRefundRowInputs] = useState<Record<string, RefundRowInput>>({});
  const [noShowRefundTemplateBody, setNoShowRefundTemplateBody] = useState<string | null>(null);

  const refreshSidebarCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/summary", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.counts) setSidebarCounts(data.counts as AdminSidebarCounts);
    } catch {
      // best-effort badge refresh; ignore errors
    }
  }, []);

  useEffect(() => {
    void refreshSidebarCounts();
  }, [refreshSidebarCounts]);

  useEffect(() => {
    if (view === "expert-registrations") {
      void fetchPending();
    }
    if (view === "refunds") {
      void loadRefundQueue(refundSource);
    }
    if (view === "membership-tiers") {
      void loadTierOverrides();
    }
    if (view === "featured") {
      void loadFeaturedSettings();
    }
    if (view === "categories") {
      void loadCategories();
    }
    if (view === "website-text") {
      void loadSiteTextBlocks();
    }
    if (view === "faq") {
      void loadFaqs();
    }
    if (view === "dev-tools") {
      void loadDevTools();
    }
    if (view === "freelance-review") {
      void refreshSidebarCounts();
    }
    if (view === "help-tickets") {
      // AdminHelpTicketsView self-fetches on mount + status change; just
      // refresh the sidebar count so the badge mirrors any tickets you
      // resolve from another tab/session.
      void refreshSidebarCounts();
    }
    // fetchPending / loadRefundQueue / loadTierOverrides are stable helpers that
    // only close over setState setters and the current `refundSource`;
    // view-change reload is the intended trigger here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (view !== "refunds") return;
    let cancelled = false;
    void fetch("/api/admin/message-templates", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const templates = (data.templates ?? []) as Array<{ automation_key: string; in_app_body: string }>;
        const row = templates.find((t) => t.automation_key === "expert_no_show_refund");
        setNoShowRefundTemplateBody(
          row?.in_app_body ?? TEMPLATE_FALLBACKS.expert_no_show_refund.in_app_body,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setNoShowRefundTemplateBody(TEMPLATE_FALLBACKS.expert_no_show_refund.in_app_body);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  useEffect(() => {
    if (refundSource !== "no_show" || !noShowRefundTemplateBody || refundQueue.length === 0) return;
    setRefundRowInputs((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of refundQueue) {
        const key = item.feedback_id ?? item.booking_id;
        if (next[key]?.message?.trim()) continue;
        next[key] = {
          amount: next[key]?.amount ?? "",
          message: defaultNoShowLearnerMessage(item),
        };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [refundQueue, refundSource, noShowRefundTemplateBody]);

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
    router.replace("/admin");
    router.refresh();
  }

  async function fetchPending() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/check-pending-experts");
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed");
      setPending([]);
      return;
    }
    setPending((data.experts as Pending[]) ?? []);
  }

  async function runRegistrationAction(userId: string, action: "approve" | "reject" | "waitlist") {
    setActionMsg(null);
    const res = await fetch(`/api/experts/${encodeURIComponent(userId)}/approve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) {
      setActionMsg(typeof data.error === "string" ? data.error : `${action} failed`);
      return;
    }
    setActionMsg(
      typeof data.message === "string"
        ? data.message
        : action === "approve"
          ? "Approved."
          : action === "waitlist"
            ? "Waitlisted."
            : "Rejected.",
    );
    await fetchPending();
    void refreshSidebarCounts();
  }

  const approve = (userId: string) => runRegistrationAction(userId, "approve");
  const reject = (userId: string) => runRegistrationAction(userId, "reject");
  const waitlist = (userId: string) => runRegistrationAction(userId, "waitlist");

  async function loadCategories() {
    setCatLoading(true);
    setCatErr(null);
    const res = await fetch("/api/admin/categories");
    const data = await res.json();
    setCatLoading(false);
    if (!res.ok) {
      setCatErr(typeof data.error === "string" ? data.error : "Failed to load categories");
      setCategories([]);
      return;
    }
    setCategories((data.categories as AdminCat[]) ?? []);
  }

  function openCategoryDraft() {
    setCatMsg(null);
    setCatDraft({
      name: "",
      icon: null,
      is_active: true,
      subcategories: [],
      subInput: "",
      saving: false,
      uploading: false,
      error: null,
    });
  }

  function closeCategoryDraft() {
    setCatDraft(null);
  }

  function updateDraft(patch: Partial<CatDraft>) {
    setCatDraft((d) => (d ? { ...d, ...patch } : d));
  }

  async function uploadCategoryIconFile(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/categories/icon", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Upload failed");
    }
    return typeof data.url === "string" ? data.url : null;
  }

  async function onDraftIconChange(file: File | null) {
    if (!file || !catDraft) return;
    updateDraft({ uploading: true, error: null });
    try {
      const url = await uploadCategoryIconFile(file);
      updateDraft({ icon: url, uploading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      updateDraft({ uploading: false, error: message });
    }
  }

  function onDraftAddSubcategory() {
    setCatDraft((d) => {
      if (!d) return d;
      const value = d.subInput.trim();
      if (!value) return d;
      if (d.subcategories.includes(value)) return { ...d, subInput: "" };
      return { ...d, subcategories: [...d.subcategories, value], subInput: "" };
    });
  }

  function onDraftRemoveSubcategory(value: string) {
    setCatDraft((d) =>
      d ? { ...d, subcategories: d.subcategories.filter((s) => s !== value) } : d,
    );
  }

  async function submitCategoryDraft() {
    if (!catDraft) return;
    const name = catDraft.name.trim();
    if (!name) {
      updateDraft({ error: "Name is required." });
      return;
    }
    updateDraft({ saving: true, error: null });
    setCatMsg(null);
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        icon: catDraft.icon ?? null,
        is_active: catDraft.is_active,
        subcategories: catDraft.subcategories,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      updateDraft({
        saving: false,
        error: typeof data.error === "string" ? data.error : "Create failed",
      });
      return;
    }
    setCatDraft(null);
    setCatMsg("Category created.");
    await loadCategories();
  }

  async function patchCategory(categoryId: string, patch: Record<string, unknown>) {
    setCatMsg(null);
    const res = await fetch(`/api/admin/categories/${encodeURIComponent(categoryId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCatErr(typeof data.error === "string" ? data.error : "Update failed");
      return false;
    }
    setCatErr(null);
    return true;
  }

  function applyLocalCategoryPatch(categoryId: string, patch: Partial<AdminCat>) {
    setCategories((prev) => prev.map((c) => (c.category_id === categoryId ? { ...c, ...patch } : c)));
  }

  async function updateCategoryRow(categoryId: string, patch: Partial<AdminCat>) {
    applyLocalCategoryPatch(categoryId, patch);
    const ok = await patchCategory(categoryId, patch);
    if (!ok) {
      await loadCategories();
    }
  }

  async function uploadCategoryIconForRow(categoryId: string, file: File) {
    setCatRowSubDrafts((d) => ({
      ...d,
      [categoryId]: { ...(d[categoryId] ?? { input: "" }), uploading: true },
    }));
    try {
      const url = await uploadCategoryIconFile(file);
      await updateCategoryRow(categoryId, { icon: url });
    } catch (err) {
      setCatErr(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setCatRowSubDrafts((d) => ({
        ...d,
        [categoryId]: { ...(d[categoryId] ?? { input: "" }), uploading: false },
      }));
    }
  }

  function setRowSubInput(categoryId: string, value: string) {
    setCatRowSubDrafts((d) => ({
      ...d,
      [categoryId]: { input: value, uploading: d[categoryId]?.uploading ?? false },
    }));
  }

  async function addRowSubcategory(cat: AdminCat) {
    const draft = catRowSubDrafts[cat.category_id];
    const value = (draft?.input ?? "").trim();
    if (!value) return;
    if (cat.subcategories.includes(value)) {
      setRowSubInput(cat.category_id, "");
      return;
    }
    const next = [...cat.subcategories, value];
    setRowSubInput(cat.category_id, "");
    await updateCategoryRow(cat.category_id, { subcategories: next });
  }

  async function removeRowSubcategory(cat: AdminCat, value: string) {
    const next = cat.subcategories.filter((s) => s !== value);
    await updateCategoryRow(cat.category_id, { subcategories: next });
  }

  async function loadFaqs() {
    setFaqLoading(true);
    setFaqErr(null);
    const res = await fetch("/api/admin/faqs", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setFaqLoading(false);
    if (!res.ok) {
      setFaqErr(typeof data.error === "string" ? data.error : "Failed to load FAQs");
      return;
    }
    setFaqs((data.faqs as FaqRow[]) ?? []);
  }

  function applyLocalFaqPatch(faqId: string, patch: Partial<FaqRow>) {
    setFaqs((prev) => prev.map((f) => (f.faq_id === faqId ? { ...f, ...patch } : f)));
  }

  async function patchFaqField(
    faqId: string,
    patch: Partial<Pick<FaqRow, "question" | "answer" | "is_published">>,
  ) {
    setFaqMsg(null);
    setFaqErr(null);
    applyLocalFaqPatch(faqId, patch);
    const res = await fetch(`/api/admin/faqs/${encodeURIComponent(faqId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFaqErr(typeof data.error === "string" ? data.error : "Update failed");
      await loadFaqs();
      return;
    }
    if (data.faq) {
      const updated = data.faq as FaqRow;
      setFaqs((prev) => prev.map((f) => (f.faq_id === updated.faq_id ? updated : f)));
    }
  }

  async function deleteFaq(faq: FaqRow) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete this FAQ?\n\n"${faq.question}"`)
    ) {
      return;
    }
    setFaqMsg(null);
    const res = await fetch(`/api/admin/faqs/${encodeURIComponent(faq.faq_id)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFaqErr(typeof data.error === "string" ? data.error : "Delete failed");
      return;
    }
    setFaqs((prev) => prev.filter((f) => f.faq_id !== faq.faq_id));
    setFaqMsg("FAQ deleted.");
  }

  function openFaqDraft() {
    setFaqMsg(null);
    setFaqDraft({ question: "", answer: "", saving: false, error: null });
  }

  function closeFaqDraft() {
    setFaqDraft(null);
  }

  function updateFaqDraft(patch: Partial<FaqDraft>) {
    setFaqDraft((d) => (d ? { ...d, ...patch } : d));
  }

  async function submitFaqDraft() {
    if (!faqDraft) return;
    const question = faqDraft.question.trim();
    if (!question) {
      updateFaqDraft({ error: "Question is required." });
      return;
    }
    updateFaqDraft({ saving: true, error: null });
    const res = await fetch("/api/admin/faqs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer: faqDraft.answer }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      updateFaqDraft({
        saving: false,
        error: typeof data.error === "string" ? data.error : "Create failed",
      });
      return;
    }
    if (data.faq) {
      setFaqs((prev) => [...prev, data.faq as FaqRow]);
    } else {
      await loadFaqs();
    }
    setFaqDraft(null);
    setFaqMsg("FAQ created.");
  }

  async function loadSiteTextBlocks() {
    setSiteTextLoading(true);
    setSiteTextErr(null);
    const res = await fetch("/api/admin/site-text", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setSiteTextLoading(false);
    if (!res.ok) {
      setSiteTextErr(typeof data.error === "string" ? data.error : "Failed to load blocks");
      return;
    }
    setSiteTextBlocks((data.blocks as SiteTextBlock[]) ?? []);
  }

  function beginEditBlock(block: SiteTextBlock) {
    setSiteTextMsg(null);
    setSiteTextEditing({
      blockId: block.block_id,
      content: block.content,
      saving: false,
      error: null,
    });
  }

  function cancelEditBlock() {
    setSiteTextEditing(null);
  }

  async function submitEditBlock() {
    if (!siteTextEditing) return;
    setSiteTextEditing((e) => (e ? { ...e, saving: true, error: null } : e));
    const res = await fetch(
      `/api/admin/site-text/${encodeURIComponent(siteTextEditing.blockId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: siteTextEditing.content }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSiteTextEditing((e) =>
        e
          ? { ...e, saving: false, error: typeof data.error === "string" ? data.error : "Save failed" }
          : e,
      );
      return;
    }
    const updated = data.block as SiteTextBlock | undefined;
    if (updated) {
      setSiteTextBlocks((prev) =>
        prev.map((b) => (b.block_id === updated.block_id ? updated : b)),
      );
    }
    setSiteTextEditing(null);
    setSiteTextMsg("Block updated.");
  }

  async function loadDevTools() {
    setDevToolsLoading(true);
    setDevToolsErr(null);
    const res = await fetch("/api/admin/dev-tools", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setDevToolsLoading(false);
    if (!res.ok) {
      setDevToolsErr(typeof data.error === "string" ? data.error : "Failed to load DEV tools");
      return;
    }
    setDevTools((data.tools as DevToolEntry[]) ?? []);
  }

  async function toggleDevTool(entry: DevToolEntry, nextEnabled: boolean) {
    setDevToolsErr(null);
    setDevToolsPending((prev) => ({ ...prev, [entry.key]: true }));
    setDevTools((prev) =>
      prev.map((t) => (t.key === entry.key ? { ...t, enabled: nextEnabled } : t)),
    );
    const res = await fetch(`/api/admin/dev-tools/${encodeURIComponent(entry.key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: nextEnabled }),
    });
    const data = await res.json().catch(() => ({}));
    setDevToolsPending((prev) => {
      const next = { ...prev };
      delete next[entry.key];
      return next;
    });
    if (!res.ok) {
      setDevTools((prev) =>
        prev.map((t) => (t.key === entry.key ? { ...t, enabled: !nextEnabled } : t)),
      );
      setDevToolsErr(typeof data.error === "string" ? data.error : "Update failed");
    }
  }

  async function loadFeaturedSettings() {
    setFeatLoading(true);
    setFeatErr(null);
    const res = await fetch("/api/admin/featured-experts-settings");
    const data = await res.json();
    setFeatLoading(false);
    if (!res.ok) {
      setFeatErr(typeof data.error === "string" ? data.error : "Failed to load featured rules");
      return;
    }
    const s = data.settings as {
      include_temp: boolean;
      include_pending: boolean;
      min_complete_sessions: number | null;
      require_verified: boolean;
      min_avg_rating: number | null;
      require_profile_picture?: boolean;
    };
    setFeatIncludeTemp(s.include_temp);
    setFeatIncludePending(s.include_pending);
    setFeatMinSessions(s.min_complete_sessions == null ? "" : String(s.min_complete_sessions));
    setFeatRequireVerified(s.require_verified);
    setFeatMinRating(s.min_avg_rating == null ? "" : String(s.min_avg_rating));
    setFeatRequireProfilePicture(s.require_profile_picture ?? true);
  }

  async function saveFeaturedSettings() {
    setFeatMsg(null);
    setFeatErr(null);
    const minS = featMinSessions.trim() === "" ? null : Number(featMinSessions);
    const minR = featMinRating.trim() === "" ? null : Number(featMinRating);
    if (minS != null && (!Number.isFinite(minS) || minS < 0)) {
      setFeatErr("Min completed sessions must be a non-negative integer or empty.");
      return;
    }
    if (minR != null && (!Number.isFinite(minR) || minR < 1 || minR > 5)) {
      setFeatErr("Min average rating must be between 1 and 5 or empty.");
      return;
    }
    const res = await fetch("/api/admin/featured-experts-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        include_temp: featIncludeTemp,
        include_pending: featIncludePending,
        min_complete_sessions: minS,
        require_verified: featRequireVerified,
        min_avg_rating: minR,
        require_profile_picture: featRequireProfilePicture,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeatErr(typeof data.error === "string" ? data.error : "Save failed");
      return;
    }
    setFeatMsg("Featured list rules saved.");
    if (data.settings) {
      const s = data.settings as { min_complete_sessions: number | null; min_avg_rating: number | null };
      setFeatMinSessions(s.min_complete_sessions == null ? "" : String(s.min_complete_sessions));
      setFeatMinRating(s.min_avg_rating == null ? "" : String(s.min_avg_rating));
    }
  }

  const loadRefundQueue = useCallback(
    async (source: BookingProblemSource = refundSource) => {
      setRefundLoading(true);
      setRefundErr(null);
      const res = await fetch(
        `/api/admin/booking-refund-queue?source=${encodeURIComponent(source)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      setRefundLoading(false);
      if (!res.ok) {
        setRefundErr(typeof data.error === "string" ? data.error : "Failed to load refund queue");
        setRefundQueue([]);
        return;
      }
      setRefundQueue((data.bookings as RefundQueueItem[]) ?? []);
    },
    [refundSource],
  );

  function getRowInput(rowKey: string): RefundRowInput {
    return refundRowInputs[rowKey] ?? { amount: "", message: "" };
  }

  function setRowInput(rowKey: string, patch: Partial<RefundRowInput>) {
    setRefundRowInputs((prev) => ({
      ...prev,
      [rowKey]: { ...(prev[rowKey] ?? { amount: "", message: "" }), ...patch },
    }));
  }

  function rowKeyFor(item: RefundQueueItem): string {
    return item.feedback_id ?? item.booking_id;
  }

  function defaultNoShowLearnerMessage(item: RefundQueueItem): string {
    const body =
      noShowRefundTemplateBody ?? TEMPLATE_FALLBACKS.expert_no_show_refund.in_app_body;
    const refundDollars = item.total_amount
      ? `$${Number(item.total_amount).toFixed(2)}`
      : "";
    const scheduleVars = buildBookingScheduleVars({
      booking_id: item.booking_id,
      session_date: item.session_date,
      start_time: item.start_time,
      end_time: item.end_time,
      duration: item.duration,
      booking_amount: item.booking_amount,
      total_amount: item.total_amount,
    });
    return renderMessageTemplate(body, {
      recipient_name: item.learner_name ?? "there",
      expert_name: item.expert_name ?? "your expert",
      refund_amount: refundDollars,
      dashboard_url: "/dashboard?view=inbox",
      ...scheduleVars,
    });
  }

  /** Parse a dollars input ("", "12", "12.5") to integer cents, or null for full refund. */
  function parseAmountCents(raw: string): { cents: number | null; error: string | null } {
    const trimmed = raw.trim();
    if (trimmed === "") return { cents: null, error: null };
    const cleaned = trimmed.replace(/^\$/, "").replace(/,/g, "");
    const dollars = Number(cleaned);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      return { cents: null, error: "Enter a positive dollar amount, or leave blank for full refund." };
    }
    return { cents: Math.round(dollars * 100), error: null };
  }

  async function issueRefundForRow(item: RefundQueueItem) {
    setRefundMsg(null);
    setRefundErr(null);
    const rowKey = rowKeyFor(item);
    const input = getRowInput(rowKey);

    const { cents, error: amtErr } = parseAmountCents(input.amount);
    if (amtErr) {
      setRefundErr(amtErr);
      return;
    }

    const body: Record<string, unknown> = {
      markResolved: true,
      source: refundSource,
    };
    if (cents != null) body.amountCents = cents;
    const rowMessage = input.message.trim();
    if (rowMessage) body.message = rowMessage;
    if (item.feedback_id) body.feedbackId = item.feedback_id;

    const res = await fetch(`/api/admin/bookings/${encodeURIComponent(item.booking_id)}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setRefundErr(typeof data.error === "string" ? data.error : "Refund failed");
      return;
    }
    const amountMsg = cents != null ? `$${(cents / 100).toFixed(2)} refunded` : "full refund issued";
    const idMsg = typeof data.stripeRefundId === "string" ? ` (${data.stripeRefundId})` : "";
    const dmMsg = data.messageSent
      ? " · message sent"
      : input.message.trim() && data.messageError
        ? ` · message failed: ${String(data.messageError)}`
        : "";
    setRefundMsg(`${amountMsg}${idMsg}${dmMsg}.`);
    setRefundRowInputs((prev) => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
    await loadRefundQueue();
    void refreshSidebarCounts();
  }

  async function dismissRow(item: RefundQueueItem, source: BookingProblemSource) {
    setRefundMsg(null);
    setRefundErr(null);
    const rowKey = rowKeyFor(item);
    const input = getRowInput(rowKey);

    const body: Record<string, unknown> = { status: "resolved", source };
    if (input.message.trim()) body.message = input.message.trim();
    if (item.feedback_id) body.feedbackId = item.feedback_id;

    const res = await fetch(
      `/api/admin/bookings/${encodeURIComponent(item.booking_id)}/refund-review`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = await res.json();
    if (!res.ok) {
      setRefundErr(typeof data.error === "string" ? data.error : "Update failed");
      return;
    }
    const dmMsg = data.messageSent
      ? " · message sent"
      : input.message.trim() && data.messageError
        ? ` · message failed: ${String(data.messageError)}`
        : "";
    setRefundMsg(`Dismissed without refund${dmMsg}.`);
    setRefundRowInputs((prev) => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
    await loadRefundQueue();
    void refreshSidebarCounts();
  }

  function switchRefundSource(next: BookingProblemSource) {
    if (next === refundSource) return;
    setRefundSource(next);
    setRefundErr(null);
    setRefundMsg(null);
    setRefundRowInputs({});
    void loadRefundQueue(next);
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function dollarsToCents(raw: string): { cents: number | null; error: string | null } {
    const trimmed = raw.trim();
    if (trimmed === "") return { cents: null, error: null };
    const cleaned = trimmed.replace(/^\$/, "").replace(/,/g, "");
    const dollars = Number(cleaned);
    if (!Number.isFinite(dollars) || dollars < 0) {
      return { cents: null, error: "Custom rate must be a non-negative dollar amount." };
    }
    return { cents: Math.round(dollars * 100), error: null };
  }

  function centsToDollarsInput(cents: number | null | undefined): string {
    if (cents == null) return "";
    return (cents / 100).toFixed(2);
  }

  function expiresAtDbToInput(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    // Format as local YYYY-MM-DD so the date input shows the right day.
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function expiresAtInputToDb(dateStr: string): string | null {
    if (!dateStr.trim()) return null;
    // End of day in the admin's local tz so e.g. "expires 2026-12-31" really
    // covers all of Dec 31.
    const d = new Date(`${dateStr}T23:59:59`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function resetTierForm() {
    setTierUserId("");
    setTierValue("free");
    setTierRateDollars("");
    setTierExpiresDate("");
    setTierLookupInfo(null);
  }

  async function lookupTierForUserId() {
    setTierErr(null);
    setTierMsg(null);
    const userId = tierUserId.trim();
    if (!UUID_RE.test(userId)) {
      setTierErr("Paste a valid user_id (UUID).");
      setTierLookupInfo(null);
      return;
    }
    setTierLookupLoading(true);
    const res = await fetch("/api/admin/experts/membership-tier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await res.json();
    setTierLookupLoading(false);
    if (!res.ok) {
      setTierErr(typeof data.error === "string" ? data.error : "Lookup failed");
      setTierLookupInfo(null);
      return;
    }
    const expert = data.expert as {
      user_id: string;
      name: string | null;
      email: string | null;
      has_expert_profile: boolean;
      membership_tier: "free" | "verified" | "enterprise";
      membership_price_override_cents: number | null;
      membership_override_expires_at: string | null;
      updated_at: string | null;
    };
    setTierUserId(expert.user_id);
    setTierValue(expert.membership_tier);
    setTierRateDollars(centsToDollarsInput(expert.membership_price_override_cents));
    setTierExpiresDate(expiresAtDbToInput(expert.membership_override_expires_at));
    setTierLookupInfo({
      user_id: expert.user_id,
      name: expert.name,
      email: expert.email,
      has_expert_profile: expert.has_expert_profile,
      updated_at: expert.updated_at,
    });
  }

  /** Populate the entry row from an existing override (used by the inbox "Edit" action). */
  function beginEditFromRow(row: TierOverrideRow) {
    setTierUserId(row.user_id);
    setTierValue(row.membership_tier);
    setTierRateDollars(centsToDollarsInput(row.membership_price_override_cents));
    setTierExpiresDate(expiresAtDbToInput(row.membership_override_expires_at));
    setTierLookupInfo({
      user_id: row.user_id,
      name:
        row.name ??
        ([row.first_name, row.last_name].filter(Boolean).join(" ").trim() || null),
      email: row.email,
      has_expert_profile: true,
      updated_at: row.updated_at,
    });
    setTierMsg(null);
    setTierErr(null);
  }

  async function saveMembershipTier() {
    setTierMsg(null);
    setTierErr(null);
    const userId = tierUserId.trim();
    if (!UUID_RE.test(userId)) {
      setTierErr("Paste a valid user_id (UUID), then click Look up.");
      return;
    }
    if (!tierLookupInfo) {
      setTierErr("Click Look up before saving so we can confirm this user exists.");
      return;
    }
    if (!tierLookupInfo.has_expert_profile) {
      setTierErr("This user isn't an expert yet — no expert_profile row to update.");
      return;
    }

    const { cents, error: rateErr } = dollarsToCents(tierRateDollars);
    if (rateErr) {
      setTierErr(rateErr);
      return;
    }

    const res = await fetch("/api/admin/experts/membership-tier", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        membership_tier: tierValue,
        membership_price_override_cents: cents,
        membership_override_expires_at: expiresAtInputToDb(tierExpiresDate),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setTierErr(typeof data.error === "string" ? data.error : "Failed to save membership tier");
      return;
    }
    setTierMsg("Membership tier saved.");
    await loadTierOverrides();
  }

  async function loadTierOverrides() {
    setTierListLoading(true);
    setTierListErr(null);
    const res = await fetch("/api/admin/experts/membership-tier");
    const data = await res.json();
    setTierListLoading(false);
    if (!res.ok) {
      setTierListErr(typeof data.error === "string" ? data.error : "Failed to load overrides");
      setTierOverrides([]);
      return;
    }
    setTierOverrides((data.experts as TierOverrideRow[]) ?? []);
  }

  async function removeTierOverride(userId: string) {
    setTierMsg(null);
    setTierErr(null);
    const res = await fetch("/api/admin/experts/membership-tier", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        membership_tier: "free",
        membership_price_override_cents: null,
        membership_override_expires_at: null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setTierErr(typeof data.error === "string" ? data.error : "Failed to remove override");
      return;
    }
    setTierMsg("Override removed.");
    if (tierUserId.trim() === userId) resetTierForm();
    await loadTierOverrides();
  }

  async function loadFeedback() {
    setFeedbackLoading(true);
    setFeedbackErr(null);
    const res = await fetch("/api/admin/user-feedback");
    const data = await res.json();
    setFeedbackLoading(false);
    if (!res.ok) {
      setFeedbackErr(typeof data.error === "string" ? data.error : "Failed to load feedback");
      setFeedback([]);
      return;
    }
    setFeedback((data.feedback as FeedbackRow[]) ?? []);
  }

  const activeHeading = ADMIN_VIEW_LABELS[view] ?? "Admin";

  return (
    <div className="flex min-h-screen bg-gray-50 text-foreground">
      <AdminSidebar
        view={view}
        onSelect={setView}
        adminEmail={adminEmail}
        counts={sidebarCounts}
      />
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-5xl space-y-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#003049]">{activeHeading}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Signed in as{" "}
                <code className="rounded bg-[#003049]/5 px-1.5 py-0.5 text-xs">{adminEmail}</code>.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[#003049]/20 text-[#003049]"
              onClick={() => void signOut()}
              disabled={signingOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>

          {view === "expert-registrations" ? (
          <Card className="border-2 border-[#003049]/10 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#F77F00]" />
              <CardTitle className="text-lg text-[#003049]">Expert registrations (for review)</CardTitle>
            </div>
            <CardDescription>
              Experts who submitted registration for review appear here (<code className="text-xs">pending_admin_review</code>).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              type="button"
              onClick={() => void fetchPending()}
              disabled={loading}
              className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
            >
              {loading ? "Loading…" : "Load pending"}
            </Button>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {actionMsg ? <p className="text-sm text-emerald-600">{actionMsg}</p> : null}

            <div className="overflow-x-auto rounded-lg border border-[#003049]/10">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="border-b border-[#003049]/10 bg-gray-50/80 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="w-8 px-2 py-2" aria-label="Expand" />
                    <th className="px-3 py-2 font-medium">Submitted</th>
                    <th className="px-3 py-2 font-medium">Expert</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Experience</th>
                    <th className="px-3 py-2 font-medium">Plan</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                        {loading ? "Loading…" : "No expert registrations awaiting review. Click Load pending to refresh."}
                      </td>
                    </tr>
                  ) : (
                    pending.map((p) => {
                      const isOpen = expandedPending.has(p.user_id);
                      const toggle = () =>
                        setExpandedPending((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.user_id)) next.delete(p.user_id);
                          else next.add(p.user_id);
                          return next;
                        });
                      const displayName =
                        p.name?.trim() ||
                        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
                        "—";
                      return (
                        <Fragment key={p.user_id}>
                          <tr className="border-b border-[#003049]/5 align-top">
                            <td className="px-2 py-3 text-center">
                              <button
                                type="button"
                                onClick={toggle}
                                aria-label={isOpen ? "Collapse row" : "Expand row"}
                                className="rounded p-1 text-[#003049]/60 hover:bg-[#003049]/5 hover:text-[#003049]"
                              >
                                {isOpen ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            </td>
                            <td className="px-3 py-3 text-xs text-muted-foreground">
                              {p.registration_submitted_at
                                ? new Date(p.registration_submitted_at).toLocaleString()
                                : "—"}
                            </td>
                            <td className="px-3 py-3 text-[#003049]">{displayName}</td>
                            <td className="px-3 py-3 text-xs">{p.email ?? "—"}</td>
                            <td className="px-3 py-3 text-xs">{p.category ?? "—"}</td>
                            <td className="px-3 py-3 text-xs">{p.experience_level ?? "—"}</td>
                            <td className="px-3 py-3 text-xs capitalize">{p.membership_tier ?? "free"}</td>
                            <td className="px-3 py-3 text-xs">
                              <span
                                className={
                                  p.expert_visibility_state === "waitlisted"
                                    ? "rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800"
                                    : "rounded-full bg-[#003049]/5 px-2 py-0.5 font-medium text-[#003049]"
                                }
                              >
                                {p.expert_visibility_state ?? "—"}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                                  onClick={() => void approve(p.user_id)}
                                >
                                  Approve
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="border-amber-500/50 text-amber-700 hover:bg-amber-50"
                                  onClick={() => void waitlist(p.user_id)}
                                >
                                  Waitlist
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => void reject(p.user_id)}
                                >
                                  Deny
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {isOpen ? (
                            <tr className="border-b border-[#003049]/10 bg-gray-50/40">
                              <td></td>
                              <td colSpan={7} className="px-3 py-4">
                                <dl className="grid gap-4 sm:grid-cols-2">
                                  <div>
                                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#003049]/60">
                                      User ID
                                    </dt>
                                    <dd className="mt-1 font-mono text-[11px] break-all text-[#003049]">
                                      {p.user_id}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#003049]/60">
                                      Qualifications
                                    </dt>
                                    <dd className="mt-1 whitespace-pre-wrap text-sm text-[#003049]">
                                      {p.qualifications?.trim() || "—"}
                                    </dd>
                                  </div>
                                  <div className="sm:col-span-2">
                                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#003049]/60">
                                      Expert bio
                                    </dt>
                                    <dd className="mt-1 whitespace-pre-wrap text-sm text-[#003049]">
                                      {p.expert_bio?.trim() || "—"}
                                    </dd>
                                  </div>
                                  <div className="sm:col-span-2">
                                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#003049]/60">
                                      About services
                                    </dt>
                                    <dd className="mt-1 whitespace-pre-wrap text-sm text-[#003049]">
                                      {p.about_services?.trim() || "—"}
                                    </dd>
                                  </div>
                                  <div className="sm:col-span-2">
                                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#003049]/60">
                                      Skills &amp; specializations
                                    </dt>
                                    <dd className="mt-1 flex flex-wrap gap-1.5">
                                      {p.skills_specializations.length === 0 ? (
                                        <span className="text-sm text-muted-foreground">—</span>
                                      ) : (
                                        p.skills_specializations.map((s) => (
                                          <span
                                            key={s}
                                            className="rounded-full border border-[#003049]/15 bg-white px-2 py-0.5 text-xs text-[#003049]"
                                          >
                                            {s}
                                          </span>
                                        ))
                                      )}
                                    </dd>
                                  </div>
                                </dl>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
          ) : null}

          {view === "featured" ? (
          <Card className="border-2 border-[#003049]/10 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-[#F77F00]" />
              <CardTitle className="text-lg text-[#003049]">Featured &amp; browse experts</CardTitle>
            </div>
            <CardDescription>
              Controls who appears in the homepage featured grid and in{" "}
              <code className="text-xs">GET /api/experts</code> (search and /experts page). Apply migration{" "}
              <code className="text-xs">010_featured_experts_settings.sql</code> on v2 if this fails to load.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-[#003049]/20 text-[#003049]"
                onClick={() => void loadFeaturedSettings()}
                disabled={featLoading}
              >
                {featLoading ? "Loading…" : "Load current rules"}
              </Button>
              <Button
                type="button"
                className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                onClick={() => void saveFeaturedSettings()}
              >
                Save rules
              </Button>
            </div>
            {featErr ? <p className="text-sm text-destructive">{featErr}</p> : null}
            {featMsg ? <p className="text-sm text-emerald-600">{featMsg}</p> : null}

            <ul className="divide-y divide-[#003049]/10">
              <li className="flex items-center justify-between gap-4 py-3">
                <div>
                  <Label htmlFor="feat-profile-picture" className="text-[#003049]">
                    Has profile picture
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Hide any expert where profile picture is null.
                  </p>
                </div>
                <Switch
                  id="feat-profile-picture"
                  checked={featRequireProfilePicture}
                  onCheckedChange={setFeatRequireProfilePicture}
                />
              </li>

              <li className="flex items-center justify-between gap-4 py-3">
                <div>
                  <Label htmlFor="feat-is-approved" className="text-[#003049]">
                    Is approved
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Hide any expert who is not approved by the admin.
                  </p>
                </div>
                <Switch
                  id="feat-is-approved"
                  checked={!featIncludePending}
                  onCheckedChange={(on) => setFeatIncludePending(!on)}
                />
              </li>

              <li className="flex items-center justify-between gap-4 py-3">
                <div>
                  <Label htmlFor="feat-temp" className="text-[#003049]">
                    Include <strong>visible_temp</strong> experts
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Turn off before launch to hide migrated / non-approved profiles from public lists.
                  </p>
                </div>
                <Switch id="feat-temp" checked={featIncludeTemp} onCheckedChange={setFeatIncludeTemp} />
              </li>

              <li className="flex items-center justify-between gap-4 py-3">
                <Label htmlFor="feat-min-sessions" className="text-[#003049]">
                  Min completed sessions
                </Label>
                <Input
                  id="feat-min-sessions"
                  inputMode="numeric"
                  className="w-24 border-[#003049]/15 text-right"
                  placeholder="e.g. 5"
                  value={featMinSessions}
                  onChange={(e) => setFeatMinSessions(e.target.value)}
                />
              </li>

              <li className="flex items-center justify-between gap-4 py-3">
                <div>
                  <Label htmlFor="feat-min-rating" className="text-[#003049]">
                    Min average rating 1–5
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Uses <code className="text-xs">reviews_of_experts</code>; experts with no reviews are excluded when set.
                  </p>
                </div>
                <Input
                  id="feat-min-rating"
                  inputMode="decimal"
                  className="w-24 border-[#003049]/15 text-right"
                  placeholder="e.g. 4"
                  value={featMinRating}
                  onChange={(e) => setFeatMinRating(e.target.value)}
                />
              </li>
            </ul>
          </CardContent>
        </Card>
          ) : null}

          {view === "categories" ? (
          <section className="space-y-4">
            <header className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Tag className="h-5 w-5 text-[#F77F00]" />
                  <h2 className="text-lg font-semibold text-[#003049]">Categories</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Inactive categories are moved to the bottom. Public list uses{" "}
                  <code className="text-xs">GET /api/categories</code> (active only).
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-[#003049] hover:bg-[#003049]/5"
                onClick={() => void loadCategories()}
                disabled={catLoading}
              >
                {catLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </span>
                ) : (
                  "Refresh"
                )}
              </Button>
            </header>

            {catErr ? <p className="text-sm text-destructive">{catErr}</p> : null}
            {catMsg ? <p className="text-sm text-emerald-600">{catMsg}</p> : null}

            <div className="overflow-x-auto">
              <div className="min-w-[860px]">
                <div className="grid grid-cols-[48px_minmax(180px,1.2fr)_96px_96px_minmax(220px,2fr)_116px] items-center border-y border-[#003049]/20 bg-[#003049]/[0.03] px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#003049]/70">
                  <div>#</div>
                  <div>Name</div>
                  <div>Icon</div>
                  <div>Active</div>
                  <div>Subcategories</div>
                  <div></div>
                </div>

                {sortedCategories.map((c, idx) => {
                  const subDraft = catRowSubDrafts[c.category_id];
                  return (
                    <div
                      key={c.category_id}
                      className={`grid grid-cols-[48px_minmax(180px,1.2fr)_96px_96px_minmax(220px,2fr)_116px] items-center border-b border-[#003049]/10 px-2 py-2 text-sm ${
                        c.is_active ? "" : "bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      <div className="tabular-nums text-[#003049]/70">{idx + 1}</div>

                      <div className="pr-3">
                        <Input
                          className="h-8 border-transparent bg-transparent px-2 hover:border-[#003049]/15 focus-visible:border-[#003049]/30"
                          defaultValue={c.name}
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (next && next !== c.name) {
                              void updateCategoryRow(c.category_id, { name: next });
                            } else if (!next) {
                              e.target.value = c.name;
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      </div>

                      <div className="pr-3">
                        <label className="relative flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-[#003049]/25 bg-white text-[#003049]/60 hover:border-[#003049]/40">
                          {subDraft?.uploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : c.icon &&
                            (c.icon.startsWith("http://") ||
                              c.icon.startsWith("https://") ||
                              c.icon.startsWith("/")) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.icon}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : c.icon ? (
                            <span className="text-lg leading-none">{c.icon}</span>
                          ) : (
                            <ImageIcon className="h-4 w-4" />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) void uploadCategoryIconForRow(c.category_id, f);
                            }}
                          />
                        </label>
                      </div>

                      <div>
                        <Switch
                          checked={c.is_active}
                          onCheckedChange={(on) =>
                            void updateCategoryRow(c.category_id, { is_active: on })
                          }
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pr-3">
                        {c.subcategories.map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center gap-1 rounded-full bg-[#003049]/5 px-2 py-0.5 text-xs text-[#003049]"
                          >
                            {s}
                            <button
                              type="button"
                              aria-label={`Remove ${s}`}
                              onClick={() => void removeRowSubcategory(c, s)}
                              className="text-[#003049]/50 hover:text-[#003049]"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        <Input
                          value={subDraft?.input ?? ""}
                          onChange={(e) => setRowSubInput(c.category_id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void addRowSubcategory(c);
                            }
                          }}
                          placeholder="Add…"
                          className="h-7 w-28 border-[#003049]/15 px-2 text-xs"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Add subcategory"
                          onClick={() => void addRowSubcategory(c)}
                          className="h-7 w-7 text-[#003049] hover:bg-[#003049]/10"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div />
                    </div>
                  );
                })}

                {catDraft ? (
                  <div className="grid grid-cols-[48px_minmax(180px,1.2fr)_96px_96px_minmax(220px,2fr)_116px] items-start gap-y-2 border-b border-[#003049]/20 bg-[#F77F00]/[0.04] px-2 py-3 text-sm">
                    <div className="pt-2 text-[#003049]/60">
                      {sortedCategories.length + 1}
                    </div>
                    <div className="pr-3 pt-0.5">
                      <Input
                        autoFocus
                        value={catDraft.name}
                        placeholder="Category name"
                        onChange={(e) => updateDraft({ name: e.target.value })}
                        className="h-8 border-[#003049]/20"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !catDraft.saving) {
                            void submitCategoryDraft();
                          }
                        }}
                      />
                    </div>
                    <div className="pr-3 pt-0.5">
                      <label className="relative flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-[#003049]/30 bg-white text-[#003049]/60 hover:border-[#003049]/50">
                        {catDraft.uploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : catDraft.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={catDraft.icon}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="h-4 w-4" />
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0] ?? null;
                            e.target.value = "";
                            void onDraftIconChange(f);
                          }}
                        />
                      </label>
                    </div>
                    <div className="pt-1">
                      <Switch
                        checked={catDraft.is_active}
                        onCheckedChange={(on) => updateDraft({ is_active: on })}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pr-3 pt-0.5">
                      {catDraft.subcategories.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1 rounded-full bg-[#003049]/10 px-2 py-0.5 text-xs text-[#003049]"
                        >
                          {s}
                          <button
                            type="button"
                            aria-label={`Remove ${s}`}
                            onClick={() => onDraftRemoveSubcategory(s)}
                            className="text-[#003049]/50 hover:text-[#003049]"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <Input
                        value={catDraft.subInput}
                        onChange={(e) => updateDraft({ subInput: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onDraftAddSubcategory();
                          }
                        }}
                        placeholder="Add…"
                        className="h-7 w-28 border-[#003049]/20 px-2 text-xs"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Add subcategory"
                        onClick={onDraftAddSubcategory}
                        className="h-7 w-7 text-[#003049] hover:bg-[#003049]/10"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                        onClick={() => void submitCategoryDraft()}
                        disabled={catDraft.saving || !catDraft.name.trim()}
                      >
                        {catDraft.saving ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Submit"
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-[#003049]"
                        onClick={closeCategoryDraft}
                        disabled={catDraft.saving}
                      >
                        Cancel
                      </Button>
                    </div>
                    {catDraft.error ? (
                      <p className="col-span-6 px-1 text-xs text-destructive">{catDraft.error}</p>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openCategoryDraft}
                    className="flex w-full items-center justify-center gap-2 border-b border-[#003049]/10 px-2 py-3 text-sm text-[#003049]/70 hover:bg-[#003049]/[0.04] hover:text-[#003049]"
                  >
                    <Plus className="h-4 w-4" />
                    Add category
                  </button>
                )}
              </div>
            </div>
          </section>
          ) : null}

          {view === "refunds" ? (
          <Card className="border-2 border-[#003049]/10 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-[#F77F00]" />
              <CardTitle className="text-lg text-[#003049]">Booking problems</CardTitle>
            </div>
            <CardDescription>
              Review refund-eligible bookings. <b>Expert No Show</b> shows bookings finalized as{" "}
              <code className="text-xs">no_show_expert</code>. <b>User Complaint</b> shows complaints submitted via
              the session &ldquo;Leave a review&rdquo; dialog.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-[#003049]/10 pb-3">
              <div role="tablist" className="inline-flex rounded-md border border-[#003049]/15 bg-white p-0.5">
                <button
                  type="button"
                  role="tab"
                  aria-selected={refundSource === "no_show"}
                  className={
                    refundSource === "no_show"
                      ? "rounded-sm bg-[#003049] px-3 py-1 text-xs font-medium text-white"
                      : "rounded-sm px-3 py-1 text-xs font-medium text-[#003049]/70 hover:text-[#003049]"
                  }
                  onClick={() => switchRefundSource("no_show")}
                >
                  Expert No Show
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={refundSource === "complaint"}
                  className={
                    refundSource === "complaint"
                      ? "rounded-sm bg-[#003049] px-3 py-1 text-xs font-medium text-white"
                      : "rounded-sm px-3 py-1 text-xs font-medium text-[#003049]/70 hover:text-[#003049]"
                  }
                  onClick={() => switchRefundSource("complaint")}
                >
                  User Complaint
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-[#003049]/20 text-[#003049]"
                onClick={() => void loadRefundQueue()}
                disabled={refundLoading}
              >
                {refundLoading ? "Loading…" : "Refresh"}
              </Button>
            </div>

            {refundErr ? <p className="text-sm text-destructive">{refundErr}</p> : null}
            {refundMsg ? <p className="text-sm text-emerald-600">{refundMsg}</p> : null}

            {refundQueue.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#003049]/15 bg-gray-50/50 px-4 py-8 text-center text-sm text-muted-foreground">
                {refundLoading
                  ? "Loading…"
                  : refundSource === "complaint"
                    ? "No pending user complaints."
                    : "No pending expert no-show refunds. (Schedule /api/cron/finalize-no-show-sessions with CRON_SECRET to auto-flag these.)"}
              </div>
            ) : (
              <ul className="space-y-3">
                {refundQueue.map((item) => {
                  const rowKey = rowKeyFor(item);
                  const input = getRowInput(rowKey);
                  const totalPaid = Number(item.total_amount ?? 0);
                  const bookingAmt = Number(item.booking_amount ?? 0);
                  const refundedDollars = (Number(item.refunded_amount_cents ?? 0) / 100).toFixed(2);
                  const durationLabel = formatDuration(item.duration, item.start_time, item.end_time);
                  return (
                    <li
                      key={rowKey}
                      className="rounded-lg border border-[#003049]/10 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {refundSource === "complaint" && item.feedback_type ? (
                              <span className="rounded-full bg-[#F77F00]/10 px-2 py-0.5 font-medium text-[#F77F00]">
                                {complaintLabel(item.feedback_type)}
                              </span>
                            ) : (
                              <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">
                                Expert no-show
                              </span>
                            )}
                            <span className="text-muted-foreground">
                              Session {item.session_date}{" "}
                              {String(item.start_time).slice(0, 5)}–
                              {String(item.end_time).slice(0, 5)} · {durationLabel}
                            </span>
                            {refundSource === "complaint" && item.feedback_created_at ? (
                              <span className="text-muted-foreground">
                                Reported {new Date(item.feedback_created_at).toLocaleString()}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-sm font-medium text-[#003049]">
                            {item.learner_name ?? item.feedback_author_name ?? "Learner"}{" "}
                            <span className="font-normal text-muted-foreground">
                              &lt;{item.learner_email ?? item.feedback_author_email ?? "—"}&gt;
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums text-[#003049]">
                            <div>
                              <span className="text-muted-foreground">Total paid: </span>
                              <b>${totalPaid.toFixed(2)}</b>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Booking amount: </span>
                              <b>${bookingAmt.toFixed(2)}</b>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Duration: </span>
                              <b>{durationLabel}</b>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Refunded so far: </span>
                              <b>${refundedDollars}</b>
                            </div>
                          </div>
                          {refundSource === "complaint" && item.feedback_text ? (
                            <div className="mt-3 rounded-md border border-[#003049]/10 bg-gray-50/70 p-3 text-sm text-[#003049] whitespace-pre-wrap">
                              {item.feedback_text}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-[160px,1fr]">
                        <div className="space-y-1">
                          <Label htmlFor={`refund-amt-${rowKey}`} className="text-xs text-[#003049]/70">
                            Refund amount
                          </Label>
                          <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                              $
                            </span>
                            <Input
                              id={`refund-amt-${rowKey}`}
                              className="pl-7 border-[#003049]/15 tabular-nums"
                              inputMode="decimal"
                              placeholder={totalPaid ? totalPaid.toFixed(2) : "0.00"}
                              value={input.amount}
                              onChange={(e) => setRowInput(rowKey, { amount: e.target.value })}
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Blank = full refund of remaining balance.
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`refund-msg-${rowKey}`} className="text-xs text-[#003049]/70">
                            Message to learner (optional)
                          </Label>
                          <textarea
                            id={`refund-msg-${rowKey}`}
                            rows={2}
                            className="w-full rounded-md border border-[#003049]/15 bg-white px-3 py-2 text-sm text-[#003049] outline-none placeholder:text-[#003049]/45 focus:border-[#F77F00]"
                            placeholder="We're sorry about this session — a refund has been issued."
                            value={input.message}
                            onChange={(e) => setRowInput(rowKey, { message: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-[11px] text-muted-foreground">
                          <span className="mr-3">
                            Booking: <span className="font-mono break-all">{item.booking_id}</span>
                          </span>
                          <span>
                            Stripe:{" "}
                            <span className="font-mono break-all">
                              {item.stripe_payment_intent_id ?? "—"}
                            </span>
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                            disabled={!item.stripe_payment_intent_id}
                            onClick={() => void issueRefundForRow(item)}
                          >
                            Issue refund
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-[#003049]/20 text-[#003049]"
                            onClick={() => void dismissRow(item, refundSource)}
                          >
                            Dismiss without refund
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
          ) : null}

          {view === "membership-tiers" ? (
          <Card className="border-2 border-[#003049]/10 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-[#F77F00]" />
                <CardTitle className="text-lg text-[#003049]">Membership tier overrides</CardTitle>
              </div>
              <CardDescription>
                Paste an expert&apos;s <code className="text-xs">user_id</code> to look them up, then grant or
                update their membership tier, custom session rate, and expiration. Active overrides are listed below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[#003049]/10 pb-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-[#003049]/20 text-[#003049]"
                  onClick={() => void loadTierOverrides()}
                  disabled={tierListLoading}
                >
                  {tierListLoading ? "Loading…" : "Refresh"}
                </Button>
              </div>

              {tierErr ? <p className="text-sm text-destructive">{tierErr}</p> : null}
              {tierMsg ? <p className="text-sm text-emerald-600">{tierMsg}</p> : null}
              {tierListErr ? <p className="text-sm text-destructive">{tierListErr}</p> : null}

              <ul className="space-y-3">
                <li className="rounded-lg border border-dashed border-[#F77F00]/40 bg-[#F77F00]/5 p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#F77F00]">
                        Grant or edit override
                      </p>
                      <p className="mt-0.5 text-xs text-[#003049]/70">
                        Paste a user_id and click Look up to load the expert&apos;s current values.
                      </p>
                    </div>
                    {tierLookupInfo ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-[#003049]/70 hover:text-[#003049]"
                        onClick={resetTierForm}
                      >
                        Clear
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <div className="min-w-[280px] flex-1 space-y-1">
                      <Label htmlFor="tier-user-id" className="text-xs text-[#003049]/70">
                        Expert user_id
                      </Label>
                      <Input
                        id="tier-user-id"
                        className="border-[#003049]/15 font-mono text-xs"
                        value={tierUserId}
                        onChange={(e) => setTierUserId(e.target.value)}
                        placeholder="00000000-0000-0000-0000-000000000000"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-[#003049]/20 text-[#003049]"
                      onClick={() => void lookupTierForUserId()}
                      disabled={tierLookupLoading}
                    >
                      {tierLookupLoading ? "Looking up…" : "Look up"}
                    </Button>
                  </div>

                  {tierLookupInfo ? (
                    <div className="mt-4 space-y-3 border-t border-[#F77F00]/20 pt-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <div>
                          <span className="text-xs uppercase tracking-wide text-[#003049]/60">Full name: </span>
                          <b className="text-[#003049]">{tierLookupInfo.name ?? "—"}</b>
                        </div>
                        <div className="text-xs text-muted-foreground">{tierLookupInfo.email ?? "—"}</div>
                        {!tierLookupInfo.has_expert_profile ? (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            Not an expert yet
                          </span>
                        ) : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label htmlFor="tier-value" className="text-xs text-[#003049]/70">
                            Membership tier
                          </Label>
                          <select
                            id="tier-value"
                            className="h-9 w-full rounded-md border border-[#003049]/15 bg-background px-3 text-sm"
                            value={tierValue}
                            onChange={(e) =>
                              setTierValue(e.target.value as "free" | "verified" | "enterprise")
                            }
                          >
                            <option value="free">free</option>
                            <option value="verified">verified</option>
                            <option value="enterprise">enterprise</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="tier-rate" className="text-xs text-[#003049]/70">
                            Custom rate (optional)
                          </Label>
                          <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                              $
                            </span>
                            <Input
                              id="tier-rate"
                              inputMode="decimal"
                              className="pl-7 border-[#003049]/15 tabular-nums"
                              value={tierRateDollars}
                              onChange={(e) => setTierRateDollars(e.target.value)}
                              placeholder="e.g. 12.00"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="tier-expires" className="text-xs text-[#003049]/70">
                            Expires (optional)
                          </Label>
                          <Input
                            id="tier-expires"
                            type="date"
                            className="border-[#003049]/15"
                            value={tierExpiresDate}
                            onChange={(e) => setTierExpiresDate(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          className="bg-[#003049] text-white hover:bg-[#003049]/90"
                          onClick={() => void saveMembershipTier()}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>

                {tierOverrides.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-[#003049]/15 bg-gray-50/50 px-4 py-8 text-center text-sm text-muted-foreground">
                    {tierListLoading ? "Loading…" : "No active overrides."}
                  </li>
                ) : (
                  tierOverrides.map((row) => {
                    const displayName =
                      row.name ??
                      ([row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "—");
                    const rateLabel = centsToDollarsInput(row.membership_price_override_cents);
                    const expiresLabel = row.membership_override_expires_at
                      ? new Date(row.membership_override_expires_at).toLocaleDateString()
                      : null;
                    const expired =
                      row.membership_override_expires_at
                        ? new Date(row.membership_override_expires_at).getTime() < Date.now()
                        : false;
                    return (
                      <li
                        key={row.user_id}
                        className="rounded-lg border border-[#003049]/10 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span
                                className={
                                  row.membership_tier === "enterprise"
                                    ? "rounded-full bg-[#003049]/10 px-2 py-0.5 font-medium text-[#003049]"
                                    : row.membership_tier === "verified"
                                      ? "rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700"
                                      : "rounded-full bg-gray-100 px-2 py-0.5 font-medium text-[#003049]/70"
                                }
                              >
                                {row.membership_tier}
                              </span>
                              {expiresLabel ? (
                                <span
                                  className={
                                    expired
                                      ? "rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700"
                                      : "rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800"
                                  }
                                >
                                  {expired ? `Expired ${expiresLabel}` : `Expires ${expiresLabel}`}
                                </span>
                              ) : null}
                              <span className="text-muted-foreground">
                                Updated {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                              </span>
                            </div>
                            <div className="mt-1 text-sm font-medium text-[#003049]">
                              {displayName}{" "}
                              <span className="font-normal text-muted-foreground">
                                &lt;{row.email ?? "—"}&gt;
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums text-[#003049]">
                              <div>
                                <span className="text-muted-foreground">Custom rate: </span>
                                <b>{rateLabel ? `$${rateLabel}` : "—"}</b>
                              </div>
                              <div className="font-mono text-[11px] text-muted-foreground break-all">
                                {row.user_id}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-[#003049]/20 text-[#003049]"
                              onClick={() => beginEditFromRow(row)}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => void removeTierOverride(row.user_id)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </CardContent>
          </Card>
          ) : null}

          {view === "help-tickets" ? (
            <AdminHelpTicketsView onCountsChanged={refreshSidebarCounts} />
          ) : null}

          {view === "freelance-review" ? (
            <AdminFreelanceReviewView onCountsChanged={refreshSidebarCounts} />
          ) : null}

          {view === "user-feedback" ? (
          <Card className="border-2 border-[#003049]/10 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-[#F77F00]" />
                <CardTitle className="text-lg text-[#003049]">User Feedback</CardTitle>
              </div>
              <CardDescription>
                All submissions from the session-issue dialog, enterprise inquiry form, and category suggestion form. Most recent first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="border-[#003049]/20 text-[#003049]"
                onClick={() => void loadFeedback()}
                disabled={feedbackLoading}
              >
                {feedbackLoading ? "Loading…" : "Load feedback"}
              </Button>
              {feedbackErr ? <p className="text-sm text-destructive">{feedbackErr}</p> : null}

              <div className="overflow-x-auto rounded-lg border border-[#003049]/10">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-[#003049]/10 bg-gray-50/80 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">User</th>
                      <th className="px-3 py-2 font-medium">Feedback</th>
                      <th className="px-3 py-2 font-medium">Booking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedback.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                          {feedbackLoading ? "Loading…" : "No feedback yet. Click Load feedback to refresh."}
                        </td>
                      </tr>
                    ) : (
                      feedback.map((row) => (
                        <tr key={row.feedback_id} className="border-b border-[#003049]/5 align-top">
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {new Date(row.created_at).toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-xs font-medium text-[#003049]">
                            {row.feedback_type}
                          </td>
                          <td className="px-3 py-3 text-xs">
                            <div>{row.user_name ?? "—"}</div>
                            <div className="text-muted-foreground">{row.user_email ?? "—"}</div>
                          </td>
                          <td className="px-3 py-3 text-xs whitespace-pre-wrap">
                            {row.feedback_text}
                          </td>
                          <td className="px-3 py-3 font-mono text-[11px] break-all">
                            {row.booking_id ?? "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          ) : null}
          {view === "website-text" ? (
          <section className="space-y-4">
            <header className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Type className="h-5 w-5 text-[#F77F00]" />
                  <h2 className="text-lg font-semibold text-[#003049]">Website Text Update</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Edit copy for each public page. Expand a page to see its blocks, then
                  click <strong>Edit</strong> to change the text and <strong>Submit</strong> to save.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-[#003049] hover:bg-[#003049]/5"
                onClick={() => void loadSiteTextBlocks()}
                disabled={siteTextLoading}
              >
                {siteTextLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </span>
                ) : (
                  "Refresh"
                )}
              </Button>
            </header>

            {siteTextErr ? <p className="text-sm text-destructive">{siteTextErr}</p> : null}
            {siteTextMsg ? <p className="text-sm text-emerald-600">{siteTextMsg}</p> : null}

            {!siteTextLoading && siteTextPages.length === 0 && !siteTextErr ? (
              <p className="rounded-md border border-dashed border-[#003049]/20 bg-white px-4 py-6 text-sm text-muted-foreground">
                No text blocks yet. Run migration{" "}
                <code className="text-xs">032_site_text_blocks.sql</code> to seed the About page.
              </p>
            ) : null}

            <div className="divide-y divide-[#003049]/10 border-y border-[#003049]/10">
              {siteTextPages.map((page) => {
                const expanded = siteTextExpandedPage === page.slug;
                return (
                  <div key={page.slug}>
                    <button
                      type="button"
                      onClick={() => setSiteTextExpandedPage(expanded ? null : page.slug)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-sm hover:bg-[#003049]/[0.03]"
                    >
                      <span className="flex items-center gap-2 font-medium text-[#003049]">
                        {expanded ? (
                          <ChevronDown className="h-4 w-4 text-[#003049]/60" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-[#003049]/60" />
                        )}
                        {page.label}
                        <span className="text-xs font-normal text-muted-foreground">
                          /{page.slug}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {page.blocks.length} block{page.blocks.length === 1 ? "" : "s"}
                      </span>
                    </button>

                    {expanded ? (
                      <ul className="space-y-3 bg-white px-4 pb-4">
                        {page.blocks.map((block) => {
                          const editing =
                            siteTextEditing && siteTextEditing.blockId === block.block_id
                              ? siteTextEditing
                              : null;
                          return (
                            <li
                              key={block.block_id}
                              className="rounded-md border border-[#003049]/10 bg-white p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <h3 className="text-sm font-semibold text-[#003049]">
                                    {block.label}
                                  </h3>
                                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                                    {block.block_key}
                                  </p>
                                </div>
                                {editing ? null : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 border-[#003049]/20 text-[#003049]"
                                    onClick={() => beginEditBlock(block)}
                                  >
                                    Edit
                                  </Button>
                                )}
                              </div>

                              {editing ? (
                                <div className="mt-3 space-y-2">
                                  <textarea
                                    value={editing.content}
                                    onChange={(e) =>
                                      setSiteTextEditing((s) =>
                                        s ? { ...s, content: e.target.value } : s,
                                      )
                                    }
                                    rows={Math.min(24, Math.max(6, editing.content.split("\n").length + 2))}
                                    className="w-full rounded-md border border-[#003049]/20 bg-white p-3 font-mono text-xs leading-relaxed text-[#003049] focus:border-[#003049]/40 focus:outline-none"
                                    spellCheck
                                  />
                                  {editing.error ? (
                                    <p className="text-xs text-destructive">{editing.error}</p>
                                  ) : null}
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 text-muted-foreground hover:text-[#003049]"
                                      onClick={cancelEditBlock}
                                      disabled={editing.saving}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-8 bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                                      onClick={() => void submitEditBlock()}
                                      disabled={editing.saving}
                                    >
                                      {editing.saving ? (
                                        <span className="inline-flex items-center gap-1">
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          Submitting…
                                        </span>
                                      ) : (
                                        "Submit"
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <pre className="mt-2 whitespace-pre-wrap rounded-md bg-[#003049]/[0.03] p-3 font-sans text-xs leading-relaxed text-[#003049]/90">
                                  {block.content || (
                                    <span className="text-muted-foreground italic">
                                      (empty — click Edit to add content)
                                    </span>
                                  )}
                                </pre>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
          ) : null}
          {view === "faq" ? (
          <section className="space-y-4">
            <header className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-[#F77F00]" />
                  <h2 className="text-lg font-semibold text-[#003049]">FAQ Edit</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Inline-edit questions and answers. Changes save on blur / Enter.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-[#003049] hover:bg-[#003049]/5"
                onClick={() => void loadFaqs()}
                disabled={faqLoading}
              >
                {faqLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </span>
                ) : (
                  "Refresh"
                )}
              </Button>
            </header>

            {faqErr ? <p className="text-sm text-destructive">{faqErr}</p> : null}
            {faqMsg ? <p className="text-sm text-emerald-600">{faqMsg}</p> : null}

            {!faqLoading && faqs.length === 0 && !faqErr ? (
              <p className="rounded-md border border-dashed border-[#003049]/20 bg-white px-4 py-6 text-sm text-muted-foreground">
                No FAQs yet. Run migration{" "}
                <code className="text-xs">033_faqs.sql</code> to seed the About page FAQs, or create a new one below.
              </p>
            ) : null}

            <div className="overflow-x-auto">
              <div className="min-w-[820px]">
                <div className="grid grid-cols-[48px_minmax(240px,1fr)_minmax(320px,2fr)_40px] items-center border-y border-[#003049]/20 bg-[#003049]/[0.03] px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#003049]/70">
                  <div>#</div>
                  <div>Question</div>
                  <div>Answer</div>
                  <div></div>
                </div>

                {faqs.map((f, idx) => (
                  <div
                    key={f.faq_id}
                    className={`grid grid-cols-[48px_minmax(240px,1fr)_minmax(320px,2fr)_40px] items-start gap-y-1 border-b border-[#003049]/10 px-2 py-2 text-sm ${
                      f.is_published ? "" : "bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    <div className="pt-2 tabular-nums text-[#003049]/70">{idx + 1}</div>

                    <div className="pr-3">
                      <textarea
                        defaultValue={f.question}
                        rows={2}
                        className="w-full resize-y rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium text-[#003049] hover:border-[#003049]/15 focus:border-[#003049]/30 focus:outline-none"
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== f.question) {
                            void patchFaqField(f.faq_id, { question: next });
                          } else if (!next) {
                            e.target.value = f.question;
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            (e.target as HTMLTextAreaElement).blur();
                          }
                        }}
                      />
                    </div>

                    <div className="pr-3">
                      <textarea
                        defaultValue={f.answer}
                        rows={4}
                        className="w-full resize-y rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm leading-relaxed text-[#003049]/90 hover:border-[#003049]/15 focus:border-[#003049]/30 focus:outline-none"
                        onBlur={(e) => {
                          const next = e.target.value;
                          if (next !== f.answer) {
                            void patchFaqField(f.faq_id, { answer: next });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            (e.target as HTMLTextAreaElement).blur();
                          }
                        }}
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Delete FAQ"
                        className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => void deleteFaq(f)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}

                {faqDraft ? (
                  <div className="grid grid-cols-[48px_minmax(240px,1fr)_minmax(320px,2fr)_40px] items-start gap-y-2 border-b border-[#003049]/20 bg-[#F77F00]/[0.04] px-2 py-3 text-sm">
                    <div className="pt-2 text-[#003049]/60">{faqs.length + 1}</div>
                    <div className="pr-3">
                      <textarea
                        autoFocus
                        value={faqDraft.question}
                        onChange={(e) => updateFaqDraft({ question: e.target.value })}
                        rows={2}
                        placeholder="Question"
                        className="w-full resize-y rounded-md border border-[#003049]/20 px-2 py-1.5 text-sm font-medium text-[#003049] focus:border-[#003049]/40 focus:outline-none"
                      />
                    </div>
                    <div className="pr-3">
                      <textarea
                        value={faqDraft.answer}
                        onChange={(e) => updateFaqDraft({ answer: e.target.value })}
                        rows={4}
                        placeholder="Answer"
                        className="w-full resize-y rounded-md border border-[#003049]/20 px-2 py-1.5 text-sm leading-relaxed text-[#003049]/90 focus:border-[#003049]/40 focus:outline-none"
                      />
                    </div>
                    <div />
                    {faqDraft.error ? (
                      <p className="col-span-4 px-1 text-xs text-destructive">
                        {faqDraft.error}
                      </p>
                    ) : null}
                    <div className="col-span-4 flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 text-muted-foreground hover:text-[#003049]"
                        onClick={closeFaqDraft}
                        disabled={faqDraft.saving}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                        onClick={() => void submitFaqDraft()}
                        disabled={faqDraft.saving || !faqDraft.question.trim()}
                      >
                        {faqDraft.saving ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Submitting…
                          </span>
                        ) : (
                          "Submit"
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openFaqDraft}
                    className="flex w-full items-center justify-center gap-2 border-b border-[#003049]/10 px-2 py-3 text-sm text-[#003049]/70 hover:bg-[#003049]/[0.04] hover:text-[#003049]"
                  >
                    <Plus className="h-4 w-4" />
                    Create New
                  </button>
                )}
              </div>
            </div>
          </section>
          ) : null}
          {view === "message-templates" ? <AdminMessageTemplatesView /> : null}
          {view === "dev-tools" ? (
          <section className="space-y-4">
            <header className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-[#F77F00]" />
                  <h2 className="text-lg font-semibold text-[#003049]">DEV Tools</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Runtime toggles for development-only utilities. The list is generated from
                  the code registry, so new DEV tools show up here automatically once added.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-[#003049] hover:bg-[#003049]/5"
                onClick={() => void loadDevTools()}
                disabled={devToolsLoading}
              >
                {devToolsLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </span>
                ) : (
                  "Refresh"
                )}
              </Button>
            </header>

            {devToolsErr ? <p className="text-sm text-destructive">{devToolsErr}</p> : null}

            {!devToolsLoading && devTools.length === 0 && !devToolsErr ? (
              <p className="rounded-md border border-dashed border-[#003049]/20 bg-white px-4 py-6 text-sm text-muted-foreground">
                No DEV tools registered. Add entries to{" "}
                <code className="text-xs">lib/devTools/registry.ts</code>.
              </p>
            ) : null}

            <ul className="divide-y divide-[#003049]/10 overflow-hidden rounded-md border border-[#003049]/15 bg-white">
              {devTools.map((t) => {
                const pending = Boolean(devToolsPending[t.key]);
                return (
                  <li
                    key={t.key}
                    className="flex items-start justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[#003049]">{t.label}</p>
                        <code className="rounded bg-[#003049]/[0.06] px-1.5 py-0.5 text-[10px] font-mono text-[#003049]/70">
                          {t.key}
                        </code>
                      </div>
                      {t.description ? (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {t.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span
                        className={`text-xs font-medium ${
                          t.enabled ? "text-emerald-600" : "text-muted-foreground"
                        }`}
                      >
                        {t.enabled ? "Enabled" : "Disabled"}
                      </span>
                      <Switch
                        checked={t.enabled}
                        disabled={pending}
                        onCheckedChange={(next) => void toggleDevTool(t, next)}
                        aria-label={`Toggle ${t.label}`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}

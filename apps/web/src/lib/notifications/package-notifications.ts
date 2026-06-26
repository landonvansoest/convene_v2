import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchInAppTemplateMessage } from "@/lib/notifications/dispatch-in-app-template";
import {
  fetchMessageTemplate,
  resolveEmailFromTemplate,
  resolveSmsFromTemplate,
  TEMPLATE_FALLBACKS,
} from "@/lib/notifications/message-templates";
import { sendResolvedTemplateEmail, sendSmsTwilio, isE164Phone } from "@/lib/notifications/send-channels";

function appBaseUrl(): string {
  return (
    (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")) ||
    "http://localhost:3000"
  );
}

function displayName(row: {
  first_name: string | null;
  last_name: string | null;
  email_address: string | null;
}) {
  const n = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return n || row.email_address || "User";
}

function formatExpirationDate(expirationAt: string): string {
  const d = new Date(expirationAt);
  if (!Number.isFinite(d.getTime())) return expirationAt;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type UserRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email_address: string | null;
  phone_number: string | null;
};

async function fetchUser(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin
    .from("users")
    .select("user_id, first_name, last_name, email_address, phone_number")
    .eq("user_id", userId)
    .maybeSingle();
  return data as UserRow | null;
}

function packageUrls(expertUserId: string) {
  const base = appBaseUrl();
  return {
    book_url: `${base}/sessions?expert=${expertUserId}`,
    expert_profile_url: `${base}/experts/${expertUserId}`,
    account_url: `${base}/account`,
  };
}

async function notifyLearner(
  admin: ReturnType<typeof createAdminClient>,
  automationKey: "package_purchased" | "package_credit_expiring",
  learner: UserRow,
  vars: Record<string, string>,
) {
  const template = await fetchMessageTemplate(admin, automationKey);
  const fb = TEMPLATE_FALLBACKS[automationKey];
  if (!fb) return;

  const email = resolveEmailFromTemplate(template, vars, {
    subject: fb.email_subject,
    body: fb.email_body,
    ctaUrl: fb.email_cta_url,
    ctaLabel: fb.email_cta_label,
  });
  if (email.enabled && learner.email_address) {
    await sendResolvedTemplateEmail(learner.email_address, email);
  }

  const sms = resolveSmsFromTemplate(template, vars, fb.sms_body);
  if (sms.enabled && isE164Phone(learner.phone_number)) {
    await sendSmsTwilio(learner.phone_number, sms.body);
  }

  await dispatchInAppTemplateMessage(admin, automationKey, learner.user_id, vars);
}

export async function dispatchPackagePurchased(args: {
  learnerUserId: string;
  expertUserId: string;
  packageTitle: string;
  creditCount: number;
  expirationAt: string;
}) {
  const admin = createAdminClient();
  const learner = await fetchUser(admin, args.learnerUserId);
  const expert = await fetchUser(admin, args.expertUserId);
  if (!learner) return;

  const urls = packageUrls(args.expertUserId);
  const vars: Record<string, string> = {
    recipient_name: displayName(learner),
    expert_name: expert ? displayName(expert) : "your expert",
    package_title: args.packageTitle,
    credit_count: String(args.creditCount),
    expiration_date: formatExpirationDate(args.expirationAt),
    ...urls,
  };

  await notifyLearner(admin, "package_purchased", learner, vars);
}

export async function dispatchPackageCreditExpiring(args: {
  learnerUserId: string;
  expertUserId: string;
  packageTitle: string;
  remainingCredits: number;
  expirationAt: string;
  daysUntilExpiryLabel: string;
}) {
  const admin = createAdminClient();
  const learner = await fetchUser(admin, args.learnerUserId);
  const expert = await fetchUser(admin, args.expertUserId);
  if (!learner) return;

  const urls = packageUrls(args.expertUserId);
  const vars: Record<string, string> = {
    recipient_name: displayName(learner),
    expert_name: expert ? displayName(expert) : "your expert",
    package_title: args.packageTitle,
    remaining_credits: String(args.remainingCredits),
    expiration_date: formatExpirationDate(args.expirationAt),
    days_until_expiry_label: args.daysUntilExpiryLabel,
    ...urls,
  };

  await notifyLearner(admin, "package_credit_expiring", learner, vars);
}

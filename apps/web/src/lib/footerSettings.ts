import type { SupabaseClient } from "@supabase/supabase-js";

export type FooterSettings = {
  show_resources_links: boolean;
  allow_payment_bypass_dev: boolean;
};

const DEFAULTS: FooterSettings = {
  show_resources_links: true,
  allow_payment_bypass_dev: false,
};

export async function getFooterSettings(admin: SupabaseClient): Promise<FooterSettings> {
  const { data, error } = await admin
    .from("site_settings")
    .select("data")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) return { ...DEFAULTS };

  const raw = data.data as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return { ...DEFAULTS };

  return {
    show_resources_links:
      typeof raw.show_resources_links === "boolean"
        ? raw.show_resources_links
        : DEFAULTS.show_resources_links,
    allow_payment_bypass_dev:
      typeof raw.allow_payment_bypass_dev === "boolean"
        ? raw.allow_payment_bypass_dev
        : DEFAULTS.allow_payment_bypass_dev,
  };
}


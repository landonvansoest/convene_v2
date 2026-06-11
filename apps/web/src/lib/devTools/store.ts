import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEV_TOOL_KEYS,
  devToolDefaults,
  type DevToolKey,
} from "./registry";

/**
 * Reads the enabled flag for every known DEV tool. Missing rows fall back
 * to the registry default. A missing `dev_tools` table (migration 036 not
 * applied) also degrades to defaults so the app keeps working.
 */
export async function getDevToolsEnabledMap(
  admin: SupabaseClient,
): Promise<Record<DevToolKey, boolean>> {
  const out = devToolDefaults();

  const { data, error } = await admin
    .from("dev_tools")
    .select("tool_key, enabled")
    .in("tool_key", DEV_TOOL_KEYS as readonly string[]);

  if (error || !Array.isArray(data)) return out;

  for (const row of data as Array<{ tool_key: string; enabled: boolean }>) {
    if ((DEV_TOOL_KEYS as readonly string[]).includes(row.tool_key)) {
      out[row.tool_key as DevToolKey] = Boolean(row.enabled);
    }
  }

  return out;
}

/** Server-side convenience for a single tool (still one round-trip). */
export async function getDevToolEnabled(
  admin: SupabaseClient,
  key: DevToolKey,
): Promise<boolean> {
  const map = await getDevToolsEnabledMap(admin);
  return map[key];
}

/**
 * Upserts a dev_tools row. Safe to call even if migration 036 hasn't run;
 * returns `{ ok: false, migrationMissing: true }` so callers can surface
 * a clean error message.
 */
export async function setDevToolEnabled(
  admin: SupabaseClient,
  key: DevToolKey,
  enabled: boolean,
): Promise<
  | { ok: true }
  | { ok: false; migrationMissing: true }
  | { ok: false; migrationMissing: false; error: string }
> {
  const { error } = await admin
    .from("dev_tools")
    .upsert(
      { tool_key: key, enabled, updated_at: new Date().toISOString() },
      { onConflict: "tool_key" },
    );

  if (!error) return { ok: true };

  if (
    error.code === "42P01" ||
    /relation .*dev_tools.* does not exist/i.test(error.message ?? "")
  ) {
    return { ok: false, migrationMissing: true };
  }

  return { ok: false, migrationMissing: false, error: error.message };
}

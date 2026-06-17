/**
 * Canonical registry of all runtime-toggleable DEV tools surfaced in the
 * admin dashboard under Website CMS → DEV Tools. Each entry is the
 * authoritative metadata for a tool; the Supabase `dev_tools` table only
 * stores the current enabled boolean per key.
 *
 * To add a new DEV tool:
 *   1. Add an entry below (pick a snake_case key + clear label/description).
 *   2. Read the enabled flag at the call site via `getDevToolsEnabledMap()`
 *      (server) or `/api/dev-tools/public` (client).
 *   3. Optionally seed an explicit row via a follow-up migration. The
 *      server store will lazily return `defaultEnabled` if no row exists.
 */

export const DEV_TOOL_KEYS = [
  "payment_bypass_session",
  "email_verification_bypass",
] as const;

export type DevToolKey = (typeof DEV_TOOL_KEYS)[number];

export type DevToolDef = {
  key: DevToolKey;
  label: string;
  description: string;
  /** Fallback when no `dev_tools` row exists yet (migration not run, new tool, etc.). */
  defaultEnabled: boolean;
};

export const DEV_TOOLS: DevToolDef[] = [
  {
    key: "payment_bypass_session",
    label: "Session payment bypass",
    description:
      "Lets learners complete session bookings without entering a real card. " +
      "In production this also requires ALLOW_PAYMENT_BYPASS=true — flip this off to force card checkout everywhere.",
    defaultEnabled: false,
  },
  {
    key: "email_verification_bypass",
    label: "Signup email verification bypass",
    description:
      "Shows the ‘DEV Bypass Email Verification Link’ button on the signup page so new accounts can skip the magic-link step. " +
      "Has no effect in production builds. Keep off unless you're debugging email delivery — the real Supabase confirmation flow should be exercised.",
    defaultEnabled: false,
  },
];

export function isDevToolKey(value: unknown): value is DevToolKey {
  return (
    typeof value === "string" &&
    (DEV_TOOL_KEYS as readonly string[]).includes(value)
  );
}

export function devToolDefaults(): Record<DevToolKey, boolean> {
  const out = {} as Record<DevToolKey, boolean>;
  for (const def of DEV_TOOLS) out[def.key] = def.defaultEnabled;
  return out;
}

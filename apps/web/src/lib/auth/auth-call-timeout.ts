const DEFAULT_AUTH_TIMEOUT_MS = 20_000;

/**
 * Prevents sign-in/sign-up UI from spinning forever when Supabase auth is unreachable
 * (bad API keys, paused project, network issues).
 */
export async function withAuthTimeout<T>(
  promise: Promise<T>,
  options?: { ms?: number; label?: string },
): Promise<T> {
  const ms = options?.ms ?? DEFAULT_AUTH_TIMEOUT_MS;
  const label = options?.label ?? "Authentication";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `${label} timed out after ${Math.round(ms / 1000)}s. ` +
            "Supabase Auth is not responding with your current API keys. " +
            "In Supabase Dashboard → Project Settings → API → Legacy API Keys, copy the anon key (starts with eyJ) " +
            "into NEXT_PUBLIC_SUPABASE_ANON_KEY and the service_role key into SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local, " +
            "then restart the dev server. Run: cd apps/web && node scripts/diagnose-supabase-auth.mjs",
        ),
      );
    }, ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

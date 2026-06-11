import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const EMAIL_OTP_TYPES: ReadonlySet<string> = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function parseEmailOtpType(raw: string | null): EmailOtpType | null {
  if (raw == null || raw === "" || !EMAIL_OTP_TYPES.has(raw)) return null;
  return raw as EmailOtpType;
}

export function safeInternalNext(value: string | null): string | null {
  if (value == null || value === "") return null;
  let path: string;
  try {
    path = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.includes("://")) return null;
  return path;
}

type AfterExchange = { kind: "fixed"; path: string } | { kind: "query_next"; defaultPath: string };

/**
 * Auth return from Supabase (email confirm, magic link, OAuth): supports `token_hash` + `type`
 * (verifyOtp) and PKCE `code` (exchangeCodeForSession).
 */
export async function completeSupabasePkceRedirect(
  request: Request,
  afterExchange: AfterExchange,
): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const otpType = parseEmailOtpType(searchParams.get("type"));
  const code = searchParams.get("code");

  let next: string;
  if (afterExchange.kind === "fixed") {
    next = afterExchange.path.startsWith("/") ? afterExchange.path : `/${afterExchange.path}`;
  } else {
    next = safeInternalNext(searchParams.get("next")) ?? afterExchange.defaultPath;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.redirect(`${origin}/?auth=config`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* ignore */
        }
      },
    },
  });

  /** Email confirm / magic links often land with token_hash + type (not PKCE code). */
  if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({
      type: otpType,
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(`${origin}/?auth=error`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

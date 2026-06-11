import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Paginated lookup — dev-only route; OK for small projects. */
async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<{ id: string; emailConfirmed: boolean } | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const users = data.users ?? [];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) {
      return { id: match.id, emailConfirmed: Boolean(match.email_confirmed_at) };
    }
    if (users.length < 200) break;
  }
  return null;
}

/**
 * Development only: marks the auth user as email-confirmed so `signInWithPassword`
 * works locally without opening Supabase email links (which often return a PKCE `code`
 * but no `code_verifier` in the browser, so `/auth/callback/signup/complete` fails).
 *
 * The client should call `signInWithPassword` then navigate to `/auth/callback/signup`.
 *
 * Requires `SUPABASE_SERVICE_ROLE_KEY`.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const email = "email" in body ? String((body as { email: unknown }).email ?? "").trim() : "";
  const password = "password" in body ? String((body as { password: unknown }).password ?? "") : "";

  if (!email.includes("@") || !password) {
    return NextResponse.json({ error: "Valid email and password required" }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server missing Supabase admin configuration" }, { status: 500 });
  }

  const found = await findAuthUserByEmail(admin, email);
  if (!found) {
    return NextResponse.json(
      { error: "No account found for this email. Finish creating your account first." },
      { status: 400 },
    );
  }

  if (!found.emailConfirmed) {
    const { error: confirmErr } = await admin.auth.admin.updateUserById(found.id, {
      email_confirm: true,
    });
    if (confirmErr) {
      return NextResponse.json({ error: confirmErr.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

import { timingSafeEqual } from "node:crypto";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Admin access: `Authorization: Bearer ADMIN_DASHBOARD_SECRET` or signed-in user email matches `ADMIN_EMAIL`.
 */
export async function assertAdmin(request: Request): Promise<Response | null> {
  const secret = process.env.ADMIN_DASHBOARD_SECRET?.trim();
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (!secret && !adminEmail) {
    return Response.json(
      {
        error:
          "Admin not configured: set ADMIN_DASHBOARD_SECRET and/or ADMIN_EMAIL in apps/web/.env.local",
      },
      { status: 503 }
    );
  }

  const header =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  if (secret && header) {
    try {
      const a = Buffer.from(header);
      const b = Buffer.from(secret);
      if (a.length === b.length && timingSafeEqual(a, b)) return null;
    } catch {
      /* fall through */
    }
  }

  if (adminEmail) {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email && user.email.toLowerCase() === adminEmail) {
      return null;
    }
  }

  return Response.json({ error: "Forbidden" }, { status: 403 });
}

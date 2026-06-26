import { timingSafeEqual } from "node:crypto";

export function cronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    try {
      const a = Buffer.from(token);
      const b = Buffer.from(secret);
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("secret");
  if (!q) return false;
  try {
    const a = Buffer.from(q);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

import { z } from "zod";
import { publicApiError } from "@/lib/api/public-error";
import { ensureAppsWebEnvLoaded } from "@/lib/env/ensure-apps-web-env";
import { ensureDailyRoom } from "@/lib/daily/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ensureRoomSchema = z.object({
  roomName: z.string().trim().min(1),
  expSeconds: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  ensureAppsWebEnvLoaded();
  const apiKey = process.env.DAILY_API_KEY?.trim();
  const dailyDomain =
    process.env.DAILY_DOMAIN ||
    process.env.NEXT_PUBLIC_DAILY_DOMAIN ||
    "videodemo.daily.co";

  if (!apiKey) {
    return Response.json({ error: "DAILY_API_KEY not configured on server" }, { status: 500 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ensureRoomSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const { roomName, expSeconds } = parsed.data;
  try {
    const { roomUrl } = await ensureDailyRoom({ apiKey, dailyDomain, roomName, expSeconds });
    return Response.json({ roomUrl });
  } catch (e) {
    return Response.json({ error: publicApiError(e, "Video room error") }, { status: 502 });
  }
}

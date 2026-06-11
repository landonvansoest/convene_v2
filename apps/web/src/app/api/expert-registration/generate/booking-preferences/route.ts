import { z } from "zod";
import { getOpenAiClient } from "@/lib/openai/server";

const schema = z.object({
  profession: z.string().max(300).optional(),
  experienceLevel: z.string().max(100).optional(),
  qualifications: z.array(z.string().max(300)).max(10).optional(),
  ratePer15: z.number().nonnegative().optional(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const client = getOpenAiClient();
  if (!client) return Response.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });

  const p = parsed.data;
  const prompt = `Return JSON only with keys:
rate_per_15_min,
minimum_booking_minutes, maximum_booking_minutes, minimum_notice_minutes, maximum_notice_minutes, buffer_time_minutes, auto_accept, allow_session_extensions.

rate_per_15_min must be a positive number (USD per 15-minute slice) appropriate for this expert. If rate is unknown, infer a reasonable market rate from profession and experience.
All minute fields must be positive integers suitable for booking UI (use common values like 15,30,45,60,120,1440,4320,10080, etc.).
Booleans auto_accept and allow_session_extensions should be true unless the field strongly suggests otherwise.

Profession: ${p.profession ?? ""}
Experience level: ${p.experienceLevel ?? ""}
Qualifications: ${(p.qualifications ?? []).join(", ")}
Known rate per 15 minutes USD (may be zero or missing): ${Number.isFinite(p.ratePer15) && p.ratePer15 != null ? p.ratePer15 : "unknown"}`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });
  const raw = response.output_text?.trim() ?? "{}";
  try {
    const prefs = JSON.parse(raw);
    return Response.json({ preferences: prefs });
  } catch {
    return Response.json({
      preferences: {
        rate_per_15_min: 25,
        minimum_booking_minutes: 30,
        maximum_booking_minutes: 120,
        minimum_notice_minutes: 30,
        maximum_notice_minutes: 10080,
        buffer_time_minutes: 10,
        auto_accept: true,
        allow_session_extensions: true,
      },
    });
  }
}

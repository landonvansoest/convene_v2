import { z } from "zod";
import { getOpenAiClient } from "@/lib/openai/server";

const schema = z.object({
  skills: z.string().max(600).optional(),
  teachingBackground: z.string().max(800).optional(),
  audience: z.string().max(600).optional(),
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
  const prompt = `Write a concise services description (max 120 words) for an expert marketplace profile.
Best skills taught: ${p.skills ?? ""}
Prior coaching/teaching experience: ${p.teachingBackground ?? ""}
Who benefits most: ${p.audience ?? ""}
Focus on outcomes and practical support.`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  return Response.json({ services: response.output_text?.trim() ?? "" });
}

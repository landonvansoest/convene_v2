import { z } from "zod";
import { getOpenAiClient } from "@/lib/openai/server";

const schema = z.object({
  profession: z.string().max(300).optional(),
  expertise: z.string().max(500).optional(),
  achievements: z.string().max(800).optional(),
  favorite: z.string().max(500).optional(),
  qualifications: z.array(z.string().max(300)).max(10).optional(),
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
  const expertise = (p.expertise ?? "").trim() || (p.profession ?? "").trim();
  const prompt = `Write a first-person professional expert bio (max 140 words) for a consulting marketplace.
Profession: ${p.profession ?? ""}
Main expertise: ${expertise}
Notable achievements: ${p.achievements ?? ""}
Favorite thing about field: ${p.favorite ?? ""}
Qualifications: ${(p.qualifications ?? []).join(", ")}
Tone: clear, warm, credible.`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });
  const text = response.output_text?.trim() ?? "";
  return Response.json({ bio: text });
}

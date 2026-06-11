import { z } from "zod";
import { getOpenAiClient } from "@/lib/openai/server";

const schema = z.object({
  profession: z.string().max(300).optional(),
  categoryName: z.string().max(200).optional(),
  bio: z.string().max(1000).optional(),
  qualifications: z.array(z.string().max(300)).max(10).optional(),
});

function skillsFromModelJson(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const outer = JSON.parse(trimmed) as unknown;
    if (Array.isArray(outer)) {
      return outer
        .map((v) => String(v).trim())
        .filter(Boolean)
        .slice(0, 30);
    }
    if (outer && typeof outer === "object" && "skills" in (outer as object)) {
      const list = (outer as { skills?: unknown }).skills;
      if (Array.isArray(list)) {
        return list
          .map((s) => String(s).trim())
          .filter(Boolean)
          .slice(0, 30);
      }
    }
  } catch {
    // try: strip common ```json ... ``` wrapper
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    return skillsFromModelJson(fence[1].trim());
  }
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const arr = JSON.parse(arrayMatch[0]) as unknown;
      if (Array.isArray(arr)) {
        return arr
          .map((v) => String(v).trim())
          .filter(Boolean)
          .slice(0, 30);
      }
    } catch {
      // ignore
    }
  }
  return [];
}

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
  const userContent = `Suggest 12 concise skill or specialization tags for an expert on a live learning marketplace. Tags should be short phrases (2–5 words) users might search for.

Context:
Profession: ${p.profession ?? ""}
Category: ${p.categoryName ?? ""}
Bio: ${(p.bio ?? "").slice(0, 1000)}
Qualifications: ${(p.qualifications ?? []).join(", ")}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content:
            'Return only valid JSON matching this shape: {"skills": ["...","..."]}. The "skills" array must contain 10 to 12 unique short strings. No markdown, no extra keys, no explanation.',
        },
        { role: "user", content: userContent },
      ],
    });
    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const skills = skillsFromModelJson(raw);
    return Response.json({ skills });
  } catch (e) {
    console.error("[expert-registration/generate/skills]", e);
    return Response.json(
      { error: "Could not generate skills. Try again in a moment." },
      { status: 502 }
    );
  }
}

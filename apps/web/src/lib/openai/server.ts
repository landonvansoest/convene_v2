import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAiClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (!client) client = new OpenAI({ apiKey: key });
  return client;
}

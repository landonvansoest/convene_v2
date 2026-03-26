/**
 * v1 SearchResults intent + scoring (ported for natural-language queries).
 */

export type SearchExpertHit = {
  id: string;
  name: string;
  profile_photo?: string | null;
  professional_title?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  skills: string[];
  bio?: string | null;
  /** USD per 15 minutes. */
  rate_per_15_min?: number;
  rating?: number | null;
  completed_sessions?: number | null;
  is_verified?: boolean | null;
};

const intentMapping: Record<string, string[]> = {
  plumbing: ["faucet", "leak", "pipe", "drain", "toilet", "shower", "water", "sink"],
  electrical: ["wiring", "outlet", "switch", "breaker", "electric", "power", "lights"],
  carpentry: ["wood", "build", "cabinet", "shelf", "door", "frame", "deck"],
  painting: ["paint", "wall", "color", "brush", "roller"],
  hvac: ["heat", "air conditioning", "furnace", "thermostat", "vent"],
  "web development": ["website", "web app", "frontend", "backend", "html", "css", "javascript"],
  react: ["react", "component", "jsx", "hooks", "state"],
  node: ["node", "nodejs", "express", "api", "backend"],
  debug: ["bug", "error", "fix", "broken", "not working", "issue", "problem"],
  "app development": ["app", "mobile", "ios", "android", "flutter"],
  bubble: ["bubble", "no-code", "nocode"],
  marketing: ["advertise", "promote", "campaign", "social media", "brand"],
  seo: ["google", "search", "ranking", "keywords", "traffic"],
  "business strategy": ["business plan", "strategy", "growth", "revenue"],
  math: ["algebra", "calculus", "geometry", "equation", "solve"],
  science: ["chemistry", "physics", "biology", "experiment"],
  "test prep": ["sat", "act", "gre", "exam", "test"],
  fitness: ["workout", "exercise", "gym", "training", "weight"],
  nutrition: ["diet", "food", "meal", "eating", "healthy"],
  "mental health": ["stress", "anxiety", "therapy", "counseling"],
  "graphic design": ["logo", "design", "photoshop", "illustrator", "brand"],
  music: ["guitar", "piano", "drum", "sing", "instrument"],
  photography: ["photo", "camera", "picture", "shoot"],
};

export function detectIntent(query: string): string[] {
  const q = query.toLowerCase();
  const out = new Set<string>();
  for (const [skill, triggers] of Object.entries(intentMapping)) {
    for (const t of triggers) {
      if (q.includes(t)) out.add(skill);
    }
  }
  return [...out];
}

function scoreExpert(query: string, expert: SearchExpertHit): number {
  const queryLower = query.toLowerCase().trim();
  const intents = detectIntent(query);
  let score = 0;

  const nameLower = expert.name.toLowerCase();
  const categoryLower = (expert.category_name ?? "").toLowerCase();
  const titleLower = (expert.professional_title ?? "").toLowerCase();
  const bioLower = (expert.bio ?? "").toLowerCase();
  const skillsLower = expert.skills.map((s) => s.toLowerCase());

  for (const intent of intents) {
    const il = intent.toLowerCase();
    if (categoryLower.includes(il)) score += 2000;
    if (titleLower.includes(il)) score += 1200;
    for (const sk of skillsLower) {
      if (sk.includes(il) || il.includes(sk)) score += 1000;
    }
    if (bioLower.includes(il)) score += 400;
  }

  if (queryLower && nameLower.includes(queryLower)) score += 1200;
  if (queryLower && categoryLower.includes(queryLower)) score += 1000;
  if (queryLower && titleLower.includes(queryLower)) score += 800;
  if (queryLower && bioLower.includes(queryLower)) score += 500;

  const words = queryLower.split(/\s+/).filter((w) => w.length > 2);
  for (const word of words) {
    if (nameLower.includes(word)) score += 80;
    if (categoryLower.includes(word)) score += 70;
    if (titleLower.includes(word)) score += 60;
    if (bioLower.includes(word)) score += 40;
    for (const sk of skillsLower) {
      if (sk.includes(word)) score += 50;
    }
  }

  const rating = typeof expert.rating === "number" ? expert.rating : 0;
  score += rating * 15;
  if (expert.is_verified) score += 25;
  return score;
}

export function sortExpertsBestMatch(query: string, experts: SearchExpertHit[]): SearchExpertHit[] {
  if (!query.trim()) return [...experts];
  const scored = experts.map((e) => ({ e, s: scoreExpert(query, e) }));
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.e);
}

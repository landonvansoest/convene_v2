#!/usr/bin/env node
/**
 * Quick Supabase auth connectivity check (reads apps/web/.env.local).
 * Usage: node scripts/diagnose-supabase-auth.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

function parseEnv(contents) {
  const out = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function keyKind(key) {
  if (!key) return "missing";
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("eyJ")) return "legacy-jwt";
  return "unknown";
}

async function probe(label, url, headers, timeoutMs = 12_000) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const ms = Date.now() - started;
    return { label, ok: true, status: res.status, ms };
  } catch (e) {
    const ms = Date.now() - started;
    return { label, ok: false, error: e?.name === "AbortError" ? "timeout" : String(e?.message ?? e), ms };
  } finally {
    clearTimeout(timer);
  }
}

if (!fs.existsSync(envPath)) {
  console.error("Missing", envPath);
  process.exit(1);
}

const env = parseEnv(fs.readFileSync(envPath, "utf8"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  console.error("NEXT_PUBLIC_SUPABASE_URL is not set in .env.local");
  process.exit(1);
}

console.log("Supabase URL:", url);
console.log("Client key type:", keyKind(anon), anon?.startsWith("sb_publishable_") ? "(auth endpoints timing out with this format — use legacy anon JWT)" : "");
console.log("Server key type:", keyKind(service), service?.startsWith("sb_secret_") ? "(use legacy service_role JWT instead)" : "");
console.log("");

const results = await Promise.all([
  probe("health (no apikey)", `${url}/auth/v1/health`, {}),
  probe("health (client key)", `${url}/auth/v1/health`, { apikey: anon }),
  probe("health (server key)", `${url}/auth/v1/health`, { apikey: service }),
  probe("REST root (client key)", `${url}/rest/v1/`, {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
  }),
]);

for (const r of results) {
  if (r.ok) {
    console.log(`✓ ${r.label}: HTTP ${r.status} in ${r.ms}ms`);
  } else {
    console.log(`✗ ${r.label}: ${r.error} after ${r.ms}ms`);
  }
}

const clientHang = results.find((r) => r.label === "health (client key)" && !r.ok);
const serverHang = results.find((r) => r.label === "health (server key)" && !r.ok);
const usingLegacy = keyKind(anon) === "legacy-jwt" && keyKind(service) === "legacy-jwt";

console.log("");
if (clientHang || serverHang) {
  console.log("Diagnosis: Supabase Auth is not responding when an API key is sent.");
  console.log("REST may still answer quickly; sign-in/sign-up use Auth and will fail until this is fixed.");
  console.log("");
  if (!usingLegacy) {
    console.log("Your .env.local is still using sb_publishable_/sb_secret_ keys.");
    console.log("Swap to LEGACY JWT keys (eyJ...) from Dashboard → Project Settings → API → Legacy API Keys:");
    console.log("  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...");
    console.log("  SUPABASE_SERVICE_ROLE_KEY=eyJ...");
    console.log("Then restart npm run dev and re-run this script.");
  } else {
    console.log("Your keys are already legacy JWT (correct format). This is NOT an .env.local copy/paste issue.");
    console.log("Supabase Auth on this project appears broken or restricted. Try in order:");
    console.log("");
    console.log("  1. Dashboard → Project Settings → General — confirm project is Active (not Paused)");
    console.log("  2. Dashboard → Organization → Billing → Usage — confirm nothing is restricted (402)");
    console.log("  3. Dashboard → Logs → Auth — look for errors around sign-in attempts");
    console.log("  4. Open a Supabase support ticket: Auth /auth/v1/* requests time out with valid legacy keys");
    console.log("     Project ref: jvklwgpkvtscqoimmfix");
    console.log("");
    console.log("Workaround while waiting: create a fresh Supabase project and point .env.local at it.");
  }
  process.exit(1);
}

console.log("Supabase API keys respond normally from this machine.");

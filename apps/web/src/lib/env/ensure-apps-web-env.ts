import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

let loaded = false;

function parseEnvLocal(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * Next sometimes does not inject `apps/web/.env.local` into `process.env` for Route Handlers.
 * Read the file once (Node only) and fill missing keys.
 */
export function ensureAppsWebEnvLoaded() {
  if (loaded) return;
  loaded = true;

  const appsWebRoot = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    ".."
  );
  const envPath = path.join(appsWebRoot, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const parsed = parseEnvLocal(fs.readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    const cur = process.env[key];
    if (cur === undefined || cur === "") {
      process.env[key] = value;
    }
  }
}

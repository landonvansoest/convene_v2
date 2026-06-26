/**
 * Upload public/email/convene_logo.png to Supabase Storage for auth email templates.
 *
 * Usage (from apps/web):
 *   node scripts/upload-email-logo.mjs
 *
 * Prints the public URL to paste into Supabase → Authentication → Email Templates.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
} catch {
  /* optional */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) {
  console.error("FAIL: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const BUCKET = "email-assets";
const OBJECT_PATH = "convene_logo.png";
const logoPath = join(root, "public/email/convene_logo.png");
const bytes = readFileSync(logoPath);

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: buckets } = await admin.storage.listBuckets();
const exists = buckets?.some((b) => b.name === BUCKET);
if (!exists) {
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 512 * 1024,
  });
  if (error) {
    console.error("FAIL: createBucket", error.message);
    process.exit(1);
  }
  console.log("Created public bucket:", BUCKET);
}

const { error: uploadErr } = await admin.storage.from(BUCKET).upload(OBJECT_PATH, bytes, {
  contentType: "image/png",
  cacheControl: "3600",
  upsert: true,
});
if (uploadErr) {
  console.error("FAIL: upload", uploadErr.message);
  process.exit(1);
}

const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(OBJECT_PATH);
console.log("✅ Uploaded email logo");
console.log("Public URL (use in Supabase email template img src):");
console.log(pub.publicUrl);

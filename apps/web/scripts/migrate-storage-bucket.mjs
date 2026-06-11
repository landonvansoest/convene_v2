#!/usr/bin/env node
/**
 * migrate-storage-bucket.mjs — copy every object in one Supabase Storage
 * bucket to another (typically across projects). Pairs with the
 * 045_rewrite_storage_hostname.sql migration: this moves the bytes, that
 * rewrites the DB references.
 *
 * Why a script: Supabase Storage doesn't have a cross-project copy API, so
 * we list → download → upload object-by-object. Pages through arbitrarily
 * large buckets and recurses into subfolders.
 *
 * Usage:
 *   SRC_SUPABASE_URL=https://OLDREF.supabase.co \
 *   SRC_SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   DST_SUPABASE_URL=https://NEWREF.supabase.co \
 *   DST_SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node apps/web/scripts/migrate-storage-bucket.mjs profile-photos
 *
 *   # multiple buckets in one shot:
 *   node apps/web/scripts/migrate-storage-bucket.mjs profile-photos category-icons
 *
 * Flags via env:
 *   DRY_RUN=1     — list only, don't upload
 *   OVERWRITE=1   — replace existing destination objects (default: skip
 *                   anything that already exists in destination)
 *   PAGE_SIZE=100 — list page size (default 100, max 1000)
 *   CONCURRENCY=4 — parallel object copies (default 4)
 */

import { createClient } from "@supabase/supabase-js";

const SRC_URL = need("SRC_SUPABASE_URL");
const SRC_KEY = need("SRC_SUPABASE_SERVICE_ROLE_KEY");
const DST_URL = need("DST_SUPABASE_URL");
const DST_KEY = need("DST_SUPABASE_SERVICE_ROLE_KEY");

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const OVERWRITE = process.env.OVERWRITE === "1" || process.env.OVERWRITE === "true";
const PAGE_SIZE = clamp(Number.parseInt(process.env.PAGE_SIZE ?? "100", 10), 1, 1000, 100);
const CONCURRENCY = clamp(Number.parseInt(process.env.CONCURRENCY ?? "4", 10), 1, 16, 4);

const buckets = process.argv.slice(2);
if (buckets.length === 0) {
  fail("Pass one or more bucket names: node migrate-storage-bucket.mjs <bucket> [<bucket> ...]");
}

const src = createClient(SRC_URL, SRC_KEY, { auth: { persistSession: false } });
const dst = createClient(DST_URL, DST_KEY, { auth: { persistSession: false } });

let totalCopied = 0;
let totalSkipped = 0;
let totalFailed = 0;
const failures = [];

for (const bucket of buckets) {
  log(`\n=== ${bucket} ===`);
  await ensureBucket(bucket);
  const paths = await listAllPaths(bucket, "");
  log(`Found ${paths.length} object(s) in source.`);

  await runWithConcurrency(paths, CONCURRENCY, async (objectPath) => {
    try {
      const decision = await copyObject(bucket, objectPath);
      if (decision === "copied") totalCopied++;
      else if (decision === "skipped") totalSkipped++;
    } catch (err) {
      totalFailed++;
      failures.push({ bucket, path: objectPath, error: messageOf(err) });
      log(`  ! ${bucket}/${objectPath} — ${messageOf(err)}`);
    }
  });
}

log(
  `\nDone. Copied=${totalCopied} Skipped=${totalSkipped} Failed=${totalFailed}` +
    (DRY_RUN ? " (dry run, nothing uploaded)" : ""),
);
if (failures.length > 0) {
  log("\nFailures:");
  for (const f of failures) log(`  ${f.bucket}/${f.path}: ${f.error}`);
  process.exit(1);
}

// ---------- helpers ----------

async function ensureBucket(name) {
  if (DRY_RUN) return;
  // Check destination bucket; create as public if missing. We can't read the
  // source bucket's `public` flag through the JS SDK reliably, so default to
  // public — match it to your source bucket settings in Studio if different.
  const { data: existing, error: getErr } = await dst.storage.getBucket(name);
  if (existing && !getErr) return;
  const { error: createErr } = await dst.storage.createBucket(name, { public: true });
  if (createErr && !/already exists/i.test(createErr.message)) {
    fail(`Could not create destination bucket "${name}": ${createErr.message}`);
  }
}

async function listAllPaths(bucket, prefix) {
  // Supabase Storage `list` paginates with offset; recurse into folders.
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await src.storage.from(bucket).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) fail(`list(${bucket}/${prefix}) failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const isFolder = !entry.id || entry.metadata == null; // folder markers have no id/metadata
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (isFolder) {
        const nested = await listAllPaths(bucket, fullPath);
        all.push(...nested);
      } else {
        all.push(fullPath);
      }
    }
    if (data.length < PAGE_SIZE) break;
    offset += data.length;
  }
  return all;
}

async function copyObject(bucket, objectPath) {
  if (!OVERWRITE) {
    // Quick "exists?" probe — list parent directory and look for the leaf.
    const slash = objectPath.lastIndexOf("/");
    const dir = slash === -1 ? "" : objectPath.slice(0, slash);
    const leaf = slash === -1 ? objectPath : objectPath.slice(slash + 1);
    const { data } = await dst.storage.from(bucket).list(dir, { limit: 1000, search: leaf });
    if (Array.isArray(data) && data.some((e) => e.name === leaf)) {
      log(`  - skip ${bucket}/${objectPath} (exists at dest)`);
      return "skipped";
    }
  }

  // Download from source.
  const { data: blob, error: dlErr } = await src.storage.from(bucket).download(objectPath);
  if (dlErr) throw dlErr;
  const contentType = blob.type || guessMime(objectPath);
  const buf = Buffer.from(await blob.arrayBuffer());

  if (DRY_RUN) {
    log(`  · would copy ${bucket}/${objectPath} (${buf.length} bytes, ${contentType})`);
    return "copied";
  }

  // Upload to destination.
  const { error: upErr } = await dst.storage
    .from(bucket)
    .upload(objectPath, buf, { contentType, upsert: OVERWRITE });
  if (upErr) throw upErr;
  log(`  + ${bucket}/${objectPath} (${buf.length} bytes)`);
  return "copied";
}

async function runWithConcurrency(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

function guessMime(name) {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const map = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    pdf: "application/pdf",
    json: "application/json",
    txt: "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
}

function need(name) {
  const v = process.env[name]?.trim();
  if (!v) fail(`Missing required env var: ${name}`);
  return v;
}

function clamp(n, lo, hi, fallback) {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function messageOf(err) {
  if (!err) return "unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return JSON.stringify(err);
}

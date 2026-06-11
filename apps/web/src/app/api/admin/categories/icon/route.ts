import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "category-icons";

/**
 * Admin-only image upload for category icons. Stores the file in the public
 * `category-icons` bucket and returns the public URL. The admin grid then
 * PATCHes the category's `icon` field with that URL.
 */
export async function POST(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return Response.json({ error: "Image too large (5MB max)" }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const buckets = await admin.storage.listBuckets();
    const exists = buckets.data?.some((b) => b.name === BUCKET);
    if (!exists) {
      await admin.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: 5 * 1024 * 1024,
      });
    }
  } catch {
    // Bucket listing is sometimes blocked by policy; continue to upload.
  }

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const bytes = await file.arrayBuffer();
  const upload = await admin.storage
    .from(BUCKET)
    .upload(key, bytes, { contentType: file.type || "image/png", upsert: true });
  if (upload.error) {
    return Response.json({ error: publicApiError(upload.error) }, { status: 500 });
  }

  const pub = admin.storage.from(BUCKET).getPublicUrl(key);
  const url = pub.data.publicUrl;
  if (!url) {
    return Response.json({ error: "Could not create public URL" }, { status: 500 });
  }

  return Response.json({ url });
}

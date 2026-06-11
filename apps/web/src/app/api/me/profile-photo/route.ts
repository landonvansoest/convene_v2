import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BUCKET = "profile-photos";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return Response.json({ error: "Image too large (10MB max)" }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const buckets = await admin.storage.listBuckets();
    const exists = buckets.data?.some((b) => b.name === BUCKET);
    if (!exists) {
      await admin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 10 * 1024 * 1024 });
    }
  } catch {
    // Bucket likely exists but listing is blocked; continue to upload attempt.
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const key = `${user.id}/${Date.now()}.${ext}`;
  const bytes = await file.arrayBuffer();
  const upload = await admin.storage
    .from(BUCKET)
    .upload(key, bytes, { contentType: file.type || "image/jpeg", upsert: true });
  if (upload.error) {
    return Response.json({ error: publicApiError(upload.error) }, { status: 500 });
  }

  const pub = admin.storage.from(BUCKET).getPublicUrl(key);
  const url = pub.data.publicUrl;
  if (!url) {
    return Response.json({ error: "Could not create public URL" }, { status: 500 });
  }

  const update = await admin
    .from("users")
    .update({ profile_photo: url, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (update.error) {
    return Response.json({ error: publicApiError(update.error) }, { status: 500 });
  }

  return Response.json({ url });
}

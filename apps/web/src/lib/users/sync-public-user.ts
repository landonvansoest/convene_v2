import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Idempotent row in public.users for this auth user (Bible: user_id = auth id).
 * DB trigger should normally create the row; this covers backfill and race cases.
 */
export async function upsertPublicUserFromAuth(authUser: User) {
  const admin = createAdminClient();
  const meta = authUser.user_metadata ?? {};
  const first = String(meta.first_name ?? meta.firstName ?? "");
  const last = String(meta.last_name ?? meta.lastName ?? "");

  const { error } = await admin.from("users").upsert(
    {
      user_id: authUser.id,
      email_address: authUser.email ?? "",
      email_verified: !!authUser.email_confirmed_at,
      first_name: first,
      last_name: last,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;
}

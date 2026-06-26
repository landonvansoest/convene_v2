import { createServerSupabase } from "@/lib/supabase/server";

export async function getAuthedUserId(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

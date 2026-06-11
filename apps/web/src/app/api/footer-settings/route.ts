import { createAdminClient } from "@/lib/supabase/admin";
import { getFooterSettings } from "@/lib/footerSettings";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = createAdminClient();
  const settings = await getFooterSettings(admin);
  return Response.json({ settings });
}


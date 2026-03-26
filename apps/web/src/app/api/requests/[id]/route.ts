import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const userId = await getAuthedUserId();

  const admin = createAdminClient();
  const { data: row, error } = await admin.from("requests").select("*").eq("request_id", id).maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = userId === row.user_id;
  if (!row.is_public && !isOwner) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return Response.json({ request: row });
}

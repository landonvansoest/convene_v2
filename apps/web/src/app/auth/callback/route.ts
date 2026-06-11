import { completeSupabasePkceRedirect } from "@/lib/auth/pkce-callback";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return completeSupabasePkceRedirect(request, { kind: "query_next", defaultPath: "/" });
}

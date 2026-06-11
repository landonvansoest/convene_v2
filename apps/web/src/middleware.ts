import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return response;
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public site lives at `/`; sign-in is opt-in at `/login` only. If already signed in,
  // skip the login screen (avoids `/login` feeling like the default landing page).
  if (user && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  /**
   * Middleware only needs to run for `/login` (redirect if already signed in). Matching almost
   * every path meant Supabase session refresh ran on `/`, `/search`, RSC fetches, etc. Recreating
   * `NextResponse.next({ request })` from cookie `setAll` is a known source of flaky/missing
   * `/_next/static` CSS in Next 15 dev.
   */
  matcher: ["/login"],
};

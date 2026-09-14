import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { resolveProtectedRouteRedirect } from "@/lib/auth/redirect";
import type { PublicDatabase } from "@/lib/db/public-schema";
import { getPublicEnv } from "@/lib/env/public";

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
  return to;
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const env = getPublicEnv();
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<PublicDatabase>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const destination = resolveProtectedRouteRedirect(
    pathname,
    Boolean(user),
    request.nextUrl.searchParams.get("next"),
  );

  if (!destination) {
    return supabaseResponse;
  }

  return copyCookies(
    supabaseResponse,
    NextResponse.redirect(new URL(destination, request.url)),
  );
}

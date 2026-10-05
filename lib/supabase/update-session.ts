import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { resolveProtectedRouteRedirect } from "@/lib/auth/redirect";
import type { PublicDatabase } from "@/lib/db/public-schema";
import { parseDealIdParam } from "@/lib/deals/paths";
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

  if (destination) {
    return copyCookies(
      supabaseResponse,
      NextResponse.redirect(new URL(destination, request.url)),
    );
  }

  const gate = supabase as unknown as GateClient;
  const missing = await missingAppDealForFree(gate, pathname, Boolean(user));
  if (missing) {
    return copyCookies(supabaseResponse, unpublishedDealResponse());
  }
  if (await retiredPublicSlug(gate, pathname)) {
    return copyCookies(supabaseResponse, goneSlugResponse());
  }

  return supabaseResponse;
}

type GateClient = {
  rpc: {
    (
      fn: "caller_misses_published_preview",
      args: { p_deal_id: string },
    ): PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
    (
      fn: "preview_slug_is_retired",
      args: { p_slug: string },
    ): PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
  };
};

/**
 * Signed-in free /app/deals/{id} for a deal with no published preview.
 * loading.tsx streams a 200 before the page can call notFound(); the proxy
 * answers 404 before any body is sent. Anon still redirects to login.
 * A gate error falls through so an outage is not reported as a missing deal.
 */
async function missingAppDealForFree(
  supabase: GateClient,
  pathname: string,
  signedIn: boolean,
): Promise<boolean> {
  if (!signedIn) return false;
  const match = pathname.match(/^\/app\/deals\/([^/]+)$/);
  if (!match) return false;
  let segment = match[1];
  try {
    segment = decodeURIComponent(segment);
  } catch {
    return true;
  }
  const dealId = parseDealIdParam(segment);
  if (!dealId) return true;
  const { data, error } = await supabase.rpc("caller_misses_published_preview", {
    p_deal_id: dealId,
  });
  return !error && data === true;
}

async function retiredPublicSlug(supabase: GateClient, pathname: string): Promise<boolean> {
  const match = pathname.match(/^\/deals\/([^/]+)$/);
  if (!match || match[1] === "sitemap.xml") return false;
  let slug = match[1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    return false;
  }
  const { data, error } = await supabase.rpc("preview_slug_is_retired", { p_slug: slug });
  return !error && data === true;
}

export function goneSlugResponse(): NextResponse {
  const html = `<!doctype html><html><head><title>Gone</title><meta name="robots" content="noindex"></head><body><main><h1>This page has gone</h1></main></body></html>`;
  return new NextResponse(html, {
    status: 410,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

function unpublishedDealResponse(): NextResponse {
  const html = `<!doctype html><html><head><title>Page not found</title><meta name="robots" content="noindex"></head><body><main><h1>Page not found</h1></main></body></html>`;
  return new NextResponse(html, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

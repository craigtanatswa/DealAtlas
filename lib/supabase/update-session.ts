import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { resolveProtectedRouteRedirect } from "@/lib/auth/redirect";
import type { PublicDatabase } from "@/lib/db/public-schema";
import { parseDealIdParam } from "@/lib/deals/paths";
import { dealPathGate, dealPreviewPathSlug } from "@/lib/deals/public-slug";
import {
  buildRedirectLocation,
  resolveDealSlugRedirect,
  slugRedirectResponse,
  type SlugRedirectRow,
} from "@/lib/deals/slug-redirect";
import { getPublicEnv } from "@/lib/env/public";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
  const slugGate = await publicDealSlugGate(request);
  if (slugGate.kind === "redirect") {
    return copyCookies(supabaseResponse, slugRedirectResponse(slugGate.location));
  }
  if (slugGate.kind === "gone") {
    return copyCookies(supabaseResponse, goneSlugResponse());
  }
  if (slugGate.kind === "missing") {
    return copyCookies(supabaseResponse, unpublishedDealResponse());
  }

  return supabaseResponse;
}

type GateClient = {
  rpc: (
    fn: "caller_misses_published_preview",
    args: { p_deal_id: string },
  ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
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

type PublicDealSlugGateResult =
  | { kind: "next" | "gone" | "missing" }
  | { kind: "redirect"; location: URL };

type PreviewGateRow = {
  slug: string;
  deal_id: string;
  is_published: boolean;
  leakage_risk: string;
  unpublished_by_admin: boolean;
  main_category: string | null;
};

const PREVIEW_GATE_COLUMNS =
  "slug, deal_id, is_published, leakage_risk, unpublished_by_admin, main_category";

/**
 * Only an unpublished LOW row that no admin holds can be an expired deal, so
 * only then read the deal's deadline and status. Published pages and held rows
 * never trigger the extra query.
 */
async function slugRowWithDeal(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  preview: PreviewGateRow,
): Promise<SlugRedirectRow> {
  let submissionDeadline: string | null = null;
  let dealStatus: string | null = null;
  const expiryCandidate =
    !preview.is_published &&
    !preview.unpublished_by_admin &&
    preview.leakage_risk === "LOW";
  if (expiryCandidate) {
    const { data: deal, error } = await admin
      .from("deals")
      .select("submission_deadline, status")
      .eq("id", preview.deal_id)
      .maybeSingle();
    if (error) {
      throw new Error("Deal slug gate query failed");
    }
    submissionDeadline = deal?.submission_deadline ?? null;
    dealStatus = deal?.status ?? null;
  }
  return {
    slug: preview.slug,
    dealId: preview.deal_id,
    isPublished: preview.is_published,
    leakageRisk: preview.leakage_risk,
    unpublishedByAdmin: preview.unpublished_by_admin,
    mainCategory: preview.main_category,
    submissionDeadline,
    dealStatus,
  };
}

async function publicDealSlugGate(
  request: NextRequest,
): Promise<PublicDealSlugGateResult> {
  const pathname = request.nextUrl.pathname;
  const slug = dealPreviewPathSlug(pathname);
  if (slug === null) return { kind: "next" };
  if (slug === "") return { kind: "missing" };
  try {
    const admin = createSupabaseAdminClient();
    const [{ data: retired, error: retiredError }, { data: row, error: rowError }] = await Promise.all([
      admin.rpc("preview_slug_is_retired", { p_slug: slug }),
      admin
        .from("deal_previews")
        .select(PREVIEW_GATE_COLUMNS)
        .eq("slug", slug)
        .maybeSingle(),
    ]);
    if (retiredError || rowError) return { kind: "next" };

    let requested: SlugRedirectRow | null = null;
    if (row) {
      requested = await slugRowWithDeal(admin, row);
    }

    let aliasTarget: SlugRedirectRow | null = null;
    if (!row && retired === true) {
      const { data: aliasDealId, error: aliasError } = await admin.rpc(
        "resolve_preview_slug_alias",
        { p_slug: slug },
      );
      if (!aliasError && aliasDealId) {
        const { data: aliasRow, error: aliasRowError } = await admin
          .from("deal_previews")
          .select(PREVIEW_GATE_COLUMNS)
          .eq("deal_id", aliasDealId)
          .maybeSingle();
        if (aliasRowError) return { kind: "next" };
        if (aliasRow) {
          aliasTarget = await slugRowWithDeal(admin, aliasRow);
        }
      }
    }

    const gate = dealPathGate({
      pathname,
      retired: retired === true,
      match: requested
        ? {
            slug: requested.slug,
            dealId: requested.dealId,
            isPublished: requested.isPublished,
            leakageRisk: requested.leakageRisk,
            unpublishedByAdmin: requested.unpublishedByAdmin,
          }
        : null,
    });

    const redirectPath = resolveDealSlugRedirect({
      requested,
      retired: retired === true,
      aliasTarget,
      now: new Date(),
    });
    if (redirectPath) {
      return {
        kind: "redirect",
        location: buildRedirectLocation(redirectPath, request.nextUrl),
      };
    }

    return { kind: gate };
  } catch {
    return { kind: "next" };
  }
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

import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  landingCountFromRequest,
  recordLandingCount,
} from "@/lib/analytics/landing-count";
import { shouldHideDesignSystem } from "@/lib/env/production";
import {
  clientKeyFromRequest,
  publicPageRateLimitRule,
  retryAfterSeconds,
  sharedRateLimit,
} from "@/lib/security/rate-limit";
import { updateSession } from "@/lib/supabase/update-session";

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const pathname = request.nextUrl.pathname;
  if (
    (pathname === "/design-system" || pathname.startsWith("/design-system/")) &&
    shouldHideDesignSystem(
      {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        VERCEL_ENV: process.env.VERCEL_ENV,
      },
      request.nextUrl.hostname,
    )
  ) {
    return new NextResponse(null, { status: 404, statusText: "Not Found" });
  }

  const rule = request.method === "GET" ? publicPageRateLimitRule(pathname) : null;
  if (rule) {
    const limited = await sharedRateLimit(
      clientKeyFromRequest(request, rule.bucket),
      rule.limit,
      rule.windowMs,
    );
    if (!limited.ok) {
      return new NextResponse("Too many requests. Try again shortly.", {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds(limited)),
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }
  }

  const landingCount = landingCountFromRequest(request);
  if (landingCount) {
    event.waitUntil(recordLandingCount(landingCount));
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|ingest/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

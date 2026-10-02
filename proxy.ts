import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { shouldHideDesignSystem } from "@/lib/env/production";
import {
  clientKeyFromRequest,
  publicPageRateLimitRule,
  retryAfterSeconds,
  sharedRateLimit,
} from "@/lib/security/rate-limit";
import { updateSession } from "@/lib/supabase/update-session";

export async function proxy(request: NextRequest) {
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

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

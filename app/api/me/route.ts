import type { NextRequest } from "next/server";

import { getAuthUser } from "@/lib/auth/session";
import {
  clientKeyFromRequest,
  retryAfterSeconds,
  sharedRateLimit,
  viewerApiRateLimit,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: { ...NO_STORE, ...headers },
  });
}

export async function GET(request: NextRequest) {
  try {
    const rateLimit = viewerApiRateLimit("me");
    const limited = await sharedRateLimit(
      clientKeyFromRequest(request, rateLimit.bucket),
      rateLimit.limit,
      rateLimit.windowMs,
    );
    if (!limited.ok) {
      return json(
        { error: "Too many requests. Try again shortly." },
        429,
        { "Retry-After": String(retryAfterSeconds(limited)) },
      );
    }

    const user = await getAuthUser();
    return json({ authenticated: Boolean(user) });
  } catch (error) {
    console.error(
      "api/me failed",
      error instanceof Error ? error.name : "unknown error",
    );
    return json({ error: "Unavailable." }, 500);
  }
}

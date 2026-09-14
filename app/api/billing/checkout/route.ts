import { NextRequest, NextResponse } from "next/server";

import { getCurrentAccount } from "@/lib/auth/session";
import { createAuthenticatedCheckoutResponse } from "@/lib/billing/checkout";
import { clientKeyFromRequest, rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    { error: "Checkout requires an authenticated POST with a plan key." },
    { status: 405 },
  );
}

export async function POST(request: NextRequest) {
  const account = await getCurrentAccount();
  if (!account) {
    return NextResponse.json(
      { error: "Sign in to start a DealAtlas Pro checkout." },
      { status: 401 },
    );
  }

  const limited = rateLimit(
    clientKeyFromRequest(request, `billing-checkout:${account.user.id}`),
    8,
    60_000,
  );
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((limited.resetAt - Date.now()) / 1000)),
          ),
        },
      },
    );
  }

  return createAuthenticatedCheckoutResponse({
    request,
    user: account.user,
    profile: account.profile,
  });
}

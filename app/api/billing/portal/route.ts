import { NextRequest, NextResponse } from "next/server";

import { getCurrentAccount } from "@/lib/auth/session";
import { createCustomerPortalResponse } from "@/lib/billing/portal";
import { clientKeyFromRequest, rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    { error: "Customer portal sessions are created with POST for the signed-in user." },
    { status: 405 },
  );
}

export async function POST(request: NextRequest) {
  const account = await getCurrentAccount();
  if (!account) {
    return NextResponse.json(
      { error: "Sign in to manage billing." },
      { status: 401 },
    );
  }

  const limited = rateLimit(
    clientKeyFromRequest(request, `billing-portal:${account.user.id}`),
    8,
    60_000,
  );
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many billing portal requests. Try again shortly." },
      { status: 429 },
    );
  }

  return createCustomerPortalResponse({
    request,
    userId: account.user.id,
  });
}

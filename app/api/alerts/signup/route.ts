import { NextRequest, NextResponse } from "next/server";

import { handleAlertSignup } from "@/lib/alerts/signup/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  const result = await handleAlertSignup({
    request,
    body: (body && typeof body === "object" ? body : {}) as Record<
      string,
      unknown
    >,
  });

  if (result.status === 429) {
    return NextResponse.json(result.body, {
      status: 429,
      headers: { "Retry-After": String(result.retryAfter) },
    });
  }
  return NextResponse.json(result.body, { status: result.status });
}

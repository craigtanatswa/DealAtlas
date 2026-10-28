import { NextRequest, NextResponse } from "next/server";

import { handleAlertUnsubscribe } from "@/lib/alerts/signup/service";
import { getPublicEnv } from "@/lib/env/public";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function unsubscribe(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const result = await handleAlertUnsubscribe({ token });
  const origin = getPublicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return NextResponse.redirect(new URL(result.redirectTo, origin), 303);
}

export async function GET(request: NextRequest) {
  return unsubscribe(request);
}

export async function POST(request: NextRequest) {
  return unsubscribe(request);
}

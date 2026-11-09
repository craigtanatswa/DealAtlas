import { NextRequest, NextResponse } from "next/server";

import { handleAlertConfirm } from "@/lib/alerts/signup/service";
import { getPublicEnv } from "@/lib/env/public";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const result = await handleAlertConfirm({ token });
  const origin = getPublicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return NextResponse.redirect(new URL(result.redirectTo, origin), 303);
}

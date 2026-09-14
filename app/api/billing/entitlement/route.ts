import { NextRequest, NextResponse } from "next/server";

import { getCurrentAccount } from "@/lib/auth/session";
import { getCurrentEntitlement } from "@/lib/entitlements/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  void request.nextUrl.searchParams;

  const account = await getCurrentAccount();
  if (!account) {
    return NextResponse.json(
      { error: "Sign in to check billing status." },
      { status: 401 },
    );
  }

  const entitlement = await getCurrentEntitlement(account.user.id);
  return NextResponse.json({
    plan: entitlement.plan,
    status: entitlement.status,
    currentPeriodEnd: entitlement.currentPeriodEnd,
    cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
    billingInterval: entitlement.billingInterval,
    planKey: entitlement.planKey,
  });
}

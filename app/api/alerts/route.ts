import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentAccount } from "@/lib/auth/session";
import { listAlertCentre, markAlertStatus } from "@/lib/alerts/centre";
import { ALERT_STATUSES } from "@/lib/alerts/types";
import { assertAlertDto } from "@/lib/alerts/dto";
import { parseInputSafe, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const account = await getCurrentAccount();
  if (!account) {
    return NextResponse.json(
      { error: "Sign in to view alerts." },
      { status: 401 },
    );
  }

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 50;
  const centre = await listAlertCentre({
    userId: account.user.id,
    limit: Number.isFinite(limit) ? limit : 50,
  });
  const items = centre.items.map((item) => assertAlertDto(item));
  return NextResponse.json({
    plan: centre.plan,
    unreadCount: centre.unreadCount,
    items,
  });
}

export async function POST(request: NextRequest) {
  const account = await getCurrentAccount();
  if (!account) {
    return NextResponse.json(
      { error: "Sign in to manage alerts." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid alert update." }, { status: 400 });
  }

  const parsed = parseInputSafe(
    z.object({
      id: uuidSchema,
      status: z.enum(ALERT_STATUSES),
    }),
    body,
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid alert update." }, { status: 400 });
  }

  await markAlertStatus({
    userId: account.user.id,
    alertId: parsed.data.id,
    status: parsed.data.status,
  });
  const centre = await listAlertCentre({ userId: account.user.id });
  return NextResponse.json({
    plan: centre.plan,
    unreadCount: centre.unreadCount,
    items: centre.items.map((item) => assertAlertDto(item)),
  });
}

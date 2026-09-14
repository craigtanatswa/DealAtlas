import { NextRequest } from "next/server";

import { handleDodoWebhook } from "@/lib/billing/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleDodoWebhook(request);
}

import "server-only";

import { Webhooks } from "@dodopayments/nextjs";
import { NextRequest, NextResponse } from "next/server";

import { requireDodoWebhookKey } from "@/lib/billing/config";
import { BillingConfigError } from "@/lib/billing/errors";
import { processVerifiedDodoWebhook } from "@/lib/billing/process";

export async function handleDodoWebhook(
  request: NextRequest,
): Promise<NextResponse> {
  let webhookKey: string;
  try {
    webhookKey = requireDodoWebhookKey();
  } catch (error) {
    if (error instanceof BillingConfigError) {
      return new NextResponse(error.message, { status: 503 });
    }
    throw error;
  }

  const webhookId = request.headers.get("webhook-id");
  const rawBody = await request.text();
  const replay = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: rawBody,
  });

  const handler = Webhooks({
    webhookKey,
    onPayload: async (payload) => {
      await processVerifiedDodoWebhook({
        payload,
        rawBody,
        webhookId,
      });
    },
  });

  return handler(replay);
}

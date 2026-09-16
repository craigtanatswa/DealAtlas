import "server-only";

import { CustomerPortal } from "@dodopayments/nextjs";
import { NextRequest, NextResponse } from "next/server";

import { requireDodoApiConfig } from "@/lib/billing/config";
import { BillingConfigError } from "@/lib/billing/errors";
import { loadDodoCustomerIdForUser } from "@/lib/billing/store";

export async function createCustomerPortalResponse(input: {
  request: NextRequest;
  userId: string;
}): Promise<NextResponse> {
  let config;
  try {
    config = requireDodoApiConfig();
  } catch (error) {
    if (error instanceof BillingConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  const customerId = await loadDodoCustomerIdForUser(input.userId);
  if (!customerId) {
    return NextResponse.json(
      { error: "No billing customer is linked to this account yet." },
      { status: 404 },
    );
  }

  const portal = CustomerPortal({
    bearerToken: config.bearerToken,
    environment: config.environment,
  });

  const url = new URL(input.request.url);
  url.search = "";
  url.searchParams.set("customer_id", customerId);

  try {
    const response = await portal(new NextRequest(url, { method: "GET" }));
    if (response.status >= 500) {
      return NextResponse.json(
        { error: "Billing portal is temporarily unavailable." },
        { status: 502 },
      );
    }
    return response;
  } catch {
    return NextResponse.json(
      { error: "Billing portal is temporarily unavailable." },
      { status: 502 },
    );
  }
}

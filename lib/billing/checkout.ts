import "server-only";

import { Checkout } from "@dodopayments/nextjs";
import { NextRequest, NextResponse } from "next/server";

import { checkoutMetadata } from "@/lib/billing/metadata";
import { mapPlanKey, parseCheckoutRequest } from "@/lib/billing/plans";
import { requireDodoCheckoutConfig } from "@/lib/billing/config";
import { BillingConfigError } from "@/lib/billing/errors";
import { checkoutReturnUrl, parseCheckoutReturnTo } from "@/lib/deals/paths";
import type { AppProfile } from "@/lib/auth/types";

function checkoutCustomerName(profile: AppProfile, email: string): string {
  const display = profile.display_name?.trim();
  if (display) {
    return display.slice(0, 80);
  }
  const local = email.split("@")[0]?.trim();
  return local && local.length > 0 ? local.slice(0, 80) : "DealAtlas customer";
}

async function readCheckoutBody(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await request.json();
    } catch {
      return null;
    }
  }

  try {
    const form = await request.formData();
    return { planKey: form.get("planKey"), returnTo: form.get("returnTo") };
  } catch {
    return null;
  }
}

function wantsJson(request: NextRequest): boolean {
  const accept = request.headers.get("accept") ?? "";
  const contentType = request.headers.get("content-type") ?? "";
  return accept.includes("application/json") || contentType.includes("application/json");
}

export async function createAuthenticatedCheckoutResponse(input: {
  request: NextRequest;
  user: { id: string; email?: string | null };
  profile: AppProfile;
}): Promise<NextResponse> {
  const email = input.user.email?.trim();
  if (!email) {
    return NextResponse.json(
      { error: "A verified email is required to start checkout." },
      { status: 400 },
    );
  }

  const body = await readCheckoutBody(input.request);
  const parsed = parseCheckoutRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let config;
  try {
    config = requireDodoCheckoutConfig();
  } catch (error) {
    if (error instanceof BillingConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  const mapped = mapPlanKey(parsed.planKey, config.products);
  const returnTo = parseCheckoutReturnTo(
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).returnTo
      : null,
  );
  const returnUrl = checkoutReturnUrl(config.returnUrl, returnTo);
  const checkout = Checkout({
    bearerToken: config.bearerToken,
    environment: config.environment,
    returnUrl,
    type: "session",
  });

  const sessionRequest = new NextRequest(input.request.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      product_cart: [{ product_id: mapped.productId, quantity: 1 }],
      customer: {
        email,
        name: checkoutCustomerName(input.profile, email),
      },
      metadata: checkoutMetadata({
        userId: input.user.id,
        planKey: mapped.planKey,
      }),
      return_url: returnUrl,
      feature_flags: {
        allow_customer_editing_email: false,
      },
    }),
  });

  const response = await checkout(sessionRequest);
  if (!response.ok) {
    const message = await response.text();
    return NextResponse.json(
      { error: message || "Checkout could not be created." },
      { status: response.status },
    );
  }

  const json = (await response.json()) as { checkout_url?: string };
  if (!json.checkout_url) {
    return NextResponse.json(
      { error: "Checkout did not return a redirect URL." },
      { status: 502 },
    );
  }

  if (wantsJson(input.request)) {
    return NextResponse.json({ checkout_url: json.checkout_url });
  }

  return NextResponse.redirect(json.checkout_url, 303);
}

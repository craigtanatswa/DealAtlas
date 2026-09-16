import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("billing anti-bypass boundary", () => {
  it("creates checkout from an authenticated plan key, not a browser product ID", () => {
    const route = read("app/api/billing/checkout/route.ts");
    const checkout = read("lib/billing/checkout.ts");
    const plans = read("lib/billing/plans.ts");

    expect(route).toContain("getCurrentAccount");
    expect(route).toContain("createAuthenticatedCheckoutResponse");
    expect(route).not.toMatch(/searchParams\.get\(\s*["']productId["']/);
    expect(checkout).toContain("Checkout");
    expect(checkout).toContain("from \"@dodopayments/nextjs\"");
    expect(checkout).toContain("checkoutMetadata");
    expect(checkout).toContain("userId: input.user.id");
    expect(checkout).toContain("email_confirmed_at");
    expect(checkout).toContain("Verify your email before starting checkout.");
    expect(checkout).toContain("parseCheckoutReturnTo");
    expect(checkout).toContain("checkoutReturnUrl");
    expect(read("lib/billing/config.ts")).toMatch(
      /requireDodoCheckoutConfig[\s\S]*DODO_PAYMENTS_WEBHOOK_KEY/,
    );
    expect(plans).toContain("productId");
    expect(plans).toContain("user_id");
  });

  it("builds the customer portal from the signed-in user's stored customer id", () => {
    const route = read("app/api/billing/portal/route.ts");
    const portal = read("lib/billing/portal.ts");

    expect(route).toContain("getCurrentAccount");
    expect(route).toContain("createCustomerPortalResponse");
    expect(route).toContain('status: 405');
    expect(portal).toContain("CustomerPortal");
    expect(portal).toContain("loadDodoCustomerIdForUser");
    expect(portal).toContain('url.search = ""');
    expect(portal).toContain("customer_id");
    expect(portal).not.toContain("searchParams.get(\"customer_id\")");
    expect(portal).toContain("Billing portal is temporarily unavailable.");
    expect(portal).toContain("response.status >= 500");
  });

  it("verifies Dodo webhooks with the official adapter before applying state", () => {
    const route = read("app/api/webhooks/dodo/route.ts");
    const handler = read("lib/billing/webhook-handler.ts");
    const process = read("lib/billing/process.ts");

    expect(route).toContain("handleDodoWebhook");
    expect(handler).toContain("Webhooks");
    expect(handler).toContain("from \"@dodopayments/nextjs\"");
    expect(handler).toContain("webhook-id");
    expect(handler).toContain("requirePlanProductMap");
    expect(process).toContain("applyBillingEvent");
    expect(process).toContain("requirePlanProductMap");
    expect(process).not.toContain("UNCONFIGURED_PRODUCTS");
    expect(process).not.toMatch(/grantPro|forcePro|\?success=true/);
  });

  it("waits for verified entitlement on the return page", () => {
    const page = read("app/(marketing)/checkout/success/page.tsx");
    const confirming = read("components/billing/confirming-subscription.tsx");
    const entitlementRoute = read("app/api/billing/entitlement/route.ts");

    expect(page).toContain("getCurrentEntitlement");
    expect(page).toContain("void params.success");
    expect(page).toContain("parseCheckoutReturnTo");
    expect(page).toContain("afterConfirmHref");
    expect(page).not.toMatch(/plan === ["']PRO["'] && params\.success/);
    expect(confirming).toContain("/api/billing/entitlement");
    expect(confirming).toContain("PLANS.PRO");
    expect(confirming).toContain("afterConfirmHref");
    expect(confirming).not.toContain("searchParams");
    expect(entitlementRoute).toContain("getCurrentEntitlement");
    expect(entitlementRoute).not.toContain("success=true");
  });
});

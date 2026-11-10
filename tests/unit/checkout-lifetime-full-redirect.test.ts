import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildCheckoutSessionBody } from "@/lib/billing/checkout-session";
import { CHECKOUT_PLAN_KEYS } from "@/lib/billing/types";
import nextConfig from "../../next.config";

const ROOT = path.resolve(__dirname, "../..");

describe("checkout lifetime-full path", () => {
  it("permanently redirects the old founding-full path", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects).toContainEqual({
      source: "/checkout/founding-full",
      destination: "/checkout/lifetime-full",
      permanent: true,
    });
  });

  it("serves the page at lifetime-full and not at the old path", () => {
    expect(
      fs.existsSync(
        path.join(ROOT, "app/(marketing)/checkout/lifetime-full/page.tsx"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(ROOT, "app/(marketing)/checkout/founding-full/page.tsx"),
      ),
    ).toBe(false);
  });

  it("never puts founding in the return URL for any plan", () => {
    const returnUrl = "https://www.dealatlas.example/checkout/success";
    for (const planKey of CHECKOUT_PLAN_KEYS) {
      const body = buildCheckoutSessionBody({
        planKey,
        productId: "pdt_test_product",
        userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        email: "buyer@example.com",
        returnUrl,
      });
      expect(body.return_url).toBe(returnUrl);
      expect(String(body.return_url)).not.toMatch(/founding/i);
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { paymentPendingFor } from "@/lib/billing/payment-pending";

describe("who sees the pending state", () => {
  it("only a signed-in, non-Pro user back from checkout", () => {
    expect(paymentPendingFor({ signedIn: true, upgraded: true, isPro: false })).toBe(true);
    expect(paymentPendingFor({ signedIn: true, upgraded: true, isPro: true })).toBe(false);
    expect(paymentPendingFor({ signedIn: false, upgraded: true, isPro: false })).toBe(false);
    expect(paymentPendingFor({ signedIn: true, upgraded: false, isPro: false })).toBe(false);
  });

  it.each([
    ["/app/deals/[id]", "app/(app)/app/deals/[id]/page.tsx", /paymentPending: paymentPendingFor\(\{ signedIn: true, upgraded, isPro \}\)/],
    ["/deals/[slug]", "app/(marketing)/deals/[slug]/page.tsx", /paymentPending: paymentPendingFor\(\{\s*signedIn: Boolean\(user\),\s*upgraded,\s*isPro: mode === "pro",\s*\}\)/],
  ])("%s derives pending from the server entitlement", (_route, file, pattern) => {
    const source = readFileSync(file, "utf8");
    expect(source).toMatch(pattern);
    expect(source).toMatch(/isProEntitlement\(entitlement\)/);
    expect(source.match(/paymentPending:/g)).toHaveLength(1);
  });
});

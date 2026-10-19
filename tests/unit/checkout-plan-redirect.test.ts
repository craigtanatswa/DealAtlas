import { describe, expect, it } from "vitest";

import {
  AUTH_HOME_PATH,
  CHECKOUT_PATH,
  checkoutPathForPlan,
  loginPathForPlan,
  parseCheckoutPlan,
  sanitizeRedirectPath,
  signupPathForPlan,
} from "@/lib/auth/redirect";
import { CHECKOUT_PLAN_KEYS } from "@/lib/billing/types";

describe("checkout plan redirects", () => {
  it("parses only allowlisted plan keys", () => {
    for (const key of CHECKOUT_PLAN_KEYS) {
      expect(parseCheckoutPlan(key)).toBe(key);
    }
    expect(parseCheckoutPlan("PRO_WEEKLY")).toBeNull();
    expect(parseCheckoutPlan("")).toBeNull();
    expect(parseCheckoutPlan(null)).toBeNull();
    expect(parseCheckoutPlan(undefined)).toBeNull();
  });

  it("builds the checkout, signup and login paths for a plan", () => {
    expect(CHECKOUT_PATH).toBe("/checkout");
    expect(checkoutPathForPlan("PRO_ANNUAL")).toBe("/checkout?plan=PRO_ANNUAL");
    expect(signupPathForPlan("PRO_MONTHLY")).toBe(
      `/signup?plan=PRO_MONTHLY&next=${encodeURIComponent("/checkout?plan=PRO_MONTHLY")}`,
    );
    expect(loginPathForPlan("PRO_ANNUAL")).toBe(
      `/login?plan=PRO_ANNUAL&next=${encodeURIComponent("/checkout?plan=PRO_ANNUAL")}`,
    );
  });

  it("keeps the encoded checkout next through sanitization", () => {
    const next = new URL(
      signupPathForPlan("PRO_MONTHLY"),
      "http://localhost",
    ).searchParams.get("next");
    expect(sanitizeRedirectPath(next)).toBe("/checkout?plan=PRO_MONTHLY");
  });

  it("rejects absolute, protocol-relative and query-injected redirects", () => {
    expect(sanitizeRedirectPath("https://evil.com")).toBe(AUTH_HOME_PATH);
    expect(sanitizeRedirectPath("//evil.com")).toBe(AUTH_HOME_PATH);
    expect(sanitizeRedirectPath("/\\evil.com")).toBe(AUTH_HOME_PATH);
    expect(sanitizeRedirectPath("/checkout?plan=x://y")).toBe(AUTH_HOME_PATH);
    expect(sanitizeRedirectPath("/checkout?plan=PRO_MONTHLY&x=y@evil.com")).toBe(AUTH_HOME_PATH);
  });
});

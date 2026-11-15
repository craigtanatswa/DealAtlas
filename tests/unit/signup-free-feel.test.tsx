// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/public", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_APP_URL: "https://www.dealatlas.uk",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  }),
}));
vi.mock("@/lib/auth/actions", () => ({
  signUpAction: vi.fn(),
  signInWithGoogleAction: vi.fn(),
}));

import SignupPage from "@/app/(auth)/signup/page";
import { PricingPlans } from "@/components/billing/pricing-plans";
import { SignupForm } from "@/components/auth/signup-form";
import { checkoutPathForPlan, signupPathForPlan } from "@/lib/auth/redirect";
import { foundingCheckoutPath, foundingSignupPath, LIFETIME_PLAN_QUERY } from "@/lib/billing/founding-ui";

afterEach(cleanup);

const PLAN_OR_PRICE = /£|lifetime|founding|subscri|\bpro\b|per month|\/mo\b|\/yr\b|annual|monthly|deal/i;

function textOf(container: HTMLElement): string {
  // Visible copy plus every attribute a user or screen reader can see.
  const attrs = Array.from(container.querySelectorAll("[placeholder],[aria-label],[title]"))
    .map((el) => ["placeholder", "aria-label", "title"].map((a) => el.getAttribute(a) ?? "").join(" "))
    .join(" ");
  return `${container.textContent ?? ""} ${attrs}`;
}

describe("signup form fields", () => {
  it("has email, password and confirm password, and no display name", () => {
    const { container } = render(<SignupForm nextPath="/app" plan={null} />);
    expect(container.querySelector("input[name='email']")).not.toBeNull();
    expect(container.querySelector("input[name='password']")).not.toBeNull();
    expect(container.querySelector("input[name='confirmPassword']")).not.toBeNull();
    expect(container.querySelector("input[name='displayName']")).toBeNull();
    expect(container.textContent).not.toMatch(/display name/i);
    expect(screen.getByLabelText("Confirm password")).toBeTruthy();
    expect(screen.getByRole("button", { name: /google/i })).toBeTruthy();
  });
});

describe("signup page feels free", () => {
  it.each([
    ["lifetime", foundingCheckoutPath()],
    ["LIFETIME", foundingCheckoutPath()],
    ["PRO_MONTHLY", checkoutPathForPlan("PRO_MONTHLY")],
    ["PRO_ANNUAL", checkoutPathForPlan("PRO_ANNUAL")],
    [undefined, undefined],
  ])("shows no plan, price or subscription text for plan=%s", async (plan, next) => {
    const page = await SignupPage({ searchParams: Promise.resolve({ plan, next }) });
    const { container } = render(page);
    expect(textOf(container)).not.toMatch(PLAN_OR_PRICE);
    // The checkout next still rides along in the hidden field.
    if (next) {
      expect(container.querySelector("input[name='next']")?.getAttribute("value")).toBe(next);
    }
  });
});

describe("signed-out plan CTAs share one shape", () => {
  it("builds signup?plan=X&next=/checkout?plan=X for all three plans", () => {
    expect(signupPathForPlan("PRO_MONTHLY")).toBe(
      `/signup?plan=PRO_MONTHLY&next=${encodeURIComponent("/checkout?plan=PRO_MONTHLY")}`,
    );
    expect(signupPathForPlan("PRO_ANNUAL")).toBe(
      `/signup?plan=PRO_ANNUAL&next=${encodeURIComponent("/checkout?plan=PRO_ANNUAL")}`,
    );
    expect(LIFETIME_PLAN_QUERY).toBe("lifetime");
    expect(foundingSignupPath()).toBe(
      `/signup?plan=lifetime&next=${encodeURIComponent("/checkout?plan=lifetime")}`,
    );
    expect(foundingSignupPath()).not.toMatch(/founding/i);
  });

  it("renders those hrefs on the pricing page", () => {
    render(<PricingPlans signedIn={false} founding={{ offered: true, sold_out: false }} />);
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain(signupPathForPlan("PRO_MONTHLY"));
    expect(hrefs).toContain(signupPathForPlan("PRO_ANNUAL"));
    expect(hrefs).toContain(foundingSignupPath());
  });

  it("the Lifetime next survives the signup page into the form", async () => {
    const url = new URL(foundingSignupPath(), "http://localhost");
    const page = await SignupPage({
      searchParams: Promise.resolve({
        plan: url.searchParams.get("plan") ?? undefined,
        next: url.searchParams.get("next") ?? undefined,
      }),
    });
    const { container } = render(page);
    expect(container.querySelector("input[name='next']")?.getAttribute("value")).toBe(
      "/checkout?plan=lifetime",
    );
  });
});

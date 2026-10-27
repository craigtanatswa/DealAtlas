// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ user: { id: "user-1" }, profile: {} })),
}));
vi.mock("@/lib/billing/founding-db", () => ({
  readFoundingMember: vi.fn(async () => false),
}));
vi.mock("@/lib/billing/store", () => ({
  loadDodoCustomerIdForUser: vi.fn(async () => null),
}));
vi.mock("@/lib/entitlements/service", () => ({
  getCurrentEntitlement: vi.fn(async () => ({
    plan: "FREE",
    status: "NONE",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    billingInterval: null,
    planKey: null,
  })),
}));
vi.mock("@/lib/entitlements/policy", () => ({
  isProEntitlement: vi.fn(() => false),
}));

import BillingPage from "@/app/(app)/app/billing/page";
import { CheckoutPlanForm } from "@/components/billing/checkout-plan-form";
import { FoundingFullNotice } from "@/components/billing/founding-full-notice";
import {
  ProAnnualButtonLabel,
  ProAnnualPriceInline,
  ProAnnualPriceLead,
} from "@/components/billing/founding-price";
import { FoundingUnlockActions } from "@/components/billing/founding-unlock-actions";
import { FoundingFullCheckout } from "@/components/billing/founding-checkout-summary";
import { PricingPlans } from "@/components/billing/pricing-plans";
import { DealProCard } from "@/components/deals/deal-pro-card";
import {
  proAnnualBilledLine,
  proAnnualMonthlyEquivalent,
} from "@/lib/billing/founding-ui";

afterEach(cleanup);

const openCount = { available: true };
const soldOutCount = { available: false };
const billedLine = "billed £350/yr, VAT included";

function expectProAnnualPrice(node: ParentNode) {
  const struck = node.querySelector('s[aria-label="was £39 a month"]');
  expect(struck?.textContent).toBe("£39/mo");
  expect(struck?.nextElementSibling?.tagName).toBe("STRONG");
  expect(node.textContent).toContain("£29.17/mo");
}

describe("pro annual price helpers", () => {
  it("derives the monthly equivalent from the annual price", () => {
    expect(proAnnualMonthlyEquivalent()).toBe("£29.17");
  });

  it("builds the billed line from the annual short form", () => {
    expect(proAnnualBilledLine()).toBe(billedLine);
  });
});

describe("pro annual price components", () => {
  it("renders the struck monthly price then the annual monthly equivalent", () => {
    const { container } = render(<ProAnnualPriceInline />);
    expectProAnnualPrice(container);
    expect(container.textContent).not.toContain("£350");
  });

  it("renders the billed line under the price lead", () => {
    const { container } = render(<ProAnnualPriceLead />);
    expectProAnnualPrice(container);
    expect(screen.getByText(billedLine)).toBeTruthy();
  });

  it("puts the same price format inside the button label", () => {
    const { container } = render(<ProAnnualButtonLabel text="Start Pro annual" />);
    expectProAnnualPrice(container);
    expect(container.textContent).toContain("Start Pro annual");
  });
});

describe("pro annual surfaces", () => {
  it("shows the annual price lead and button on the pricing card", () => {
    const { container } = render(
      <PricingPlans signedIn founding={openCount} />,
    );
    expect(screen.getByText(billedLine)).toBeTruthy();
    expectProAnnualPrice(container);
    const annualButton = screen.getByRole("button", { name: /Start Pro annual/ });
    expectProAnnualPrice(annualButton);
    expect(annualButton.closest("form")?.querySelector("input[name='planKey']")?.getAttribute("value")).toBe(
      "PRO_ANNUAL",
    );
  });

  it("shows the annual price lead and button on the full checkout fallback", () => {
    const { container } = render(<FoundingFullCheckout />);
    expect(screen.getByText(billedLine)).toBeTruthy();
    expectProAnnualPrice(container);
    expectProAnnualPrice(screen.getByRole("button", { name: /Start Pro annual/ }));
  });

  it("shows the price in the sold-out annual button on a deal card", () => {
    render(<DealProCard mode="free" founding={soldOutCount} alertsHref="/app/alerts" />);
    expectProAnnualPrice(screen.getByRole("button", { name: /Or Pro annual/ }));
  });

  it("shows the price in the sold-out annual link for an anonymous visitor", () => {
    render(<DealProCard mode="anonymous" founding={soldOutCount} alertsHref="/signup" />);
    expectProAnnualPrice(screen.getByRole("link", { name: /Or Pro annual/ }));
  });

  it("shows the price in the sold-out annual link from unlock actions", () => {
    render(
      <FoundingUnlockActions
        state="sold_out"
        mode="anonymous"
      />,
    );
    expectProAnnualPrice(screen.getByRole("link", { name: /Or Pro annual/ }));
  });

  it("shows the price in the race annual button", () => {
    render(<FoundingFullNotice signedIn loginHref="/login" />);
    expectProAnnualPrice(screen.getByRole("button", { name: /Continue with annual/ }));
  });

  it("shows the price in the billing page annual button", async () => {
    const { container } = render(
      await BillingPage({ searchParams: Promise.resolve({}) }),
    );
    expect(
      screen.getByText("£39/month or £350/year. Product IDs stay on the server."),
    ).toBeTruthy();
    expectProAnnualPrice(screen.getByRole("button", { name: /Subscribe annually/ }));
    expect(container.querySelector("input[name='planKey'][value='PRO_ANNUAL']")).toBeTruthy();
  });

  it("keeps the shared checkout form label usable with a ReactNode", () => {
    render(
      <CheckoutPlanForm
        planKey="PRO_ANNUAL"
        label={<ProAnnualButtonLabel text="Subscribe annually" />}
      />,
    );
    expectProAnnualPrice(screen.getByRole("button", { name: /Subscribe annually/ }));
  });
});

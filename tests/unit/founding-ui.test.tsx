// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FoundingFullNotice } from "@/components/billing/founding-full-notice";
import { PricingPlans } from "@/components/billing/pricing-plans";
import { UnlockPanel } from "@/components/deals/unlock-panel";
import { FOUNDING_CAP } from "@/lib/billing/founding-ui";

afterEach(cleanup);

const openCount = { offered: true, remaining: 17, cap: FOUNDING_CAP };
const lastCount = { offered: true, remaining: 1, cap: FOUNDING_CAP };
const soldOutCount = { offered: true, remaining: 0, cap: FOUNDING_CAP };

function planForms(container: HTMLElement): HTMLFormElement[] {
  return Array.from(container.querySelectorAll("form"));
}

describe("founding pricing cards", () => {
  it("shows the server count and a founding offer, not a client price or example label", () => {
    const { container } = render(
      <PricingPlans signedIn count={openCount} state="available" />,
    );

    expect(screen.getByRole("heading", { name: "Pricing" })).toBeTruthy();
    expect(screen.getByText("17 of 25 founding places left")).toBeTruthy();
    expect(screen.getByText("Locked for life")).toBeTruthy();
    expect(screen.getByText("£100 less than standard annual")).toBeTruthy();
    expect(container.textContent).not.toMatch(/Example value/i);
    expect(container.textContent).not.toMatch(/only today|testimonial|#1/i);

    const forms = planForms(container);
    const annualForms = forms.filter(
      (form) => form.querySelector("input[name='planKey']")?.getAttribute("value") === "PRO_ANNUAL",
    );
    expect(annualForms).toHaveLength(2);
    expect(annualForms.every((form) => !form.querySelector("input[name='product_id']"))).toBe(true);
  });

  it("uses the last-place sentence and no extra urgency", () => {
    const { container } = render(
      <PricingPlans signedIn count={lastCount} state="last" />,
    );
    expect(screen.getByText("Last founding place · 1 of 25 places left")).toBeTruthy();
    expect(container.textContent).not.toMatch(/only today|hurry|almost gone/i);
  });

  it("replaces the founding card when the count is zero", () => {
    const { container } = render(
      <PricingPlans signedIn={false} count={soldOutCount} state="sold_out" />,
    );
    expect(
      screen.getByText("Founding membership is full. Thanks to our first 25 customers."),
    ).toBeTruthy();
    expect(screen.getByText("Recommended")).toBeTruthy();
    expect(screen.queryByText("Become a founding member")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Founding member Pro" })).toBeNull();
    expect(container.querySelector("input[name='offer']")).toBeNull();
    expect(screen.getByRole("link", { name: "Start Pro annual" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create free account" })).toBeTruthy();
  });
});

describe("founding deal paywall", () => {
  it("posts annual checkout for a signed-in free user", () => {
    const { container } = render(
      <UnlockPanel
        mode="free"
        founding={openCount}
        returnTo="/app/deals/22222222-2222-4222-8222-222222222222"
      />,
    );
    expect(screen.getByRole("button", { name: "Become a founding member – £290/yr" })).toBeTruthy();
    expect(screen.getByText(/17 of 25 places left/)).toBeTruthy();
    expect(screen.getByText(/Locked for life/)).toBeTruthy();
    const founding = planForms(container).find(
      (form) =>
        form.querySelector("input[name='planKey']")?.getAttribute("value") === "PRO_ANNUAL" &&
        form.querySelector("button")?.textContent?.includes("founding member"),
    );
    expect(founding?.querySelector("input[name='returnTo']")?.getAttribute("value")).toBe(
      "/app/deals/22222222-2222-4222-8222-222222222222",
    );
    expect(container.textContent).not.toMatch(/Example value|@|buyer@/i);
  });

  it("falls back to standard prices when founding is sold out", () => {
    const { container } = render(<UnlockPanel mode="free" founding={soldOutCount} />);
    expect(screen.getByRole("button", { name: "Start Pro – £39/mo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "or £390/yr (save £78)" })).toBeTruthy();
    expect(container.querySelector("input[name='offer']")).toBeNull();
    expect(
      container.querySelector("input[name='planKey'][value='PRO_ANNUAL']"),
    ).toBeTruthy();
  });

  it("keeps the standard unlock when founding is not offered", () => {
    render(<UnlockPanel mode="anonymous" />);
    expect(screen.getByRole("link", { name: "Unlock with DealAtlas Pro" })).toBeTruthy();
    expect(screen.queryByText(/founding/i)).toBeNull();
  });
});

describe("founding checkout race", () => {
  it("offers standard plans and keeps the deal return without a founding offer", () => {
    const { container } = render(
      <FoundingFullNotice
        signedIn
        loginHref="/login"
        returnTo="/deals/grounds-maintenance"
        returnTitle="Grounds maintenance for community sites"
      />,
    );
    expect(
      screen.getByText("Founding places just filled up. You haven't been charged."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with annual – £390/yr" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose monthly – £39/mo" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Grounds maintenance for community sites" })).toBeTruthy();
    expect(container.querySelector("input[name='offer']")).toBeNull();
    const keys = Array.from(container.querySelectorAll("input[name='planKey']")).map((input) =>
      input.getAttribute("value"),
    );
    expect(keys.sort()).toEqual(["PRO_ANNUAL", "PRO_MONTHLY"]);
  });
});

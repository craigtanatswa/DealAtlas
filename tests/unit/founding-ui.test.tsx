// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BillingSummary } from "@/components/billing/billing-summary";
import { FoundingFullNotice } from "@/components/billing/founding-full-notice";
import { PricingPlans } from "@/components/billing/pricing-plans";
import {
  FoundingCheckoutSummary,
  FoundingFullCheckout,
} from "@/components/billing/founding-checkout-summary";
import { DealProCard } from "@/components/deals/deal-pro-card";
import { UnlockPanel } from "@/components/deals/unlock-panel";
import { FoundingCheckoutButton } from "@/components/billing/founding-checkout-button";
import { FoundingPriceLead } from "@/components/billing/founding-price";
import { HomeFoundingCta } from "@/components/marketing/home-founding-cta";
import {
  FOUNDING_FULL_MESSAGE,
  FOUNDING_PLAN_KEY,
  foundingSignupPath,
} from "@/lib/billing/founding-ui";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PLAN_LINE = "Lifetime deal: £250 one-time (VAT included). Limited places.";

function planKeyOf(form: Element): string | null | undefined {
  return form.querySelector("input[name='planKey']")?.getAttribute("value");
}

const openCount = { offered: true, sold_out: false };

/** Price/plan line is next to the button (never inside it); the button is the action only. */
function lifetimeButtonScope(button: HTMLElement, buttonText: string): HTMLElement {
  expect(button.textContent).toBe(buttonText);
  expect(button.querySelector("s")).toBeNull();
  expect(button.querySelector("strong")).toBeNull();
  let scope: HTMLElement | null = button.parentElement;
  while (scope && !scope.textContent?.includes(PLAN_LINE)) scope = scope.parentElement;
  expect(scope).not.toBeNull();
  return scope!;
}

function expectFoundingPriceInside(button: HTMLElement, buttonText = "Get the Lifetime deal") {
  const scope = lifetimeButtonScope(button, buttonText);
  const was = scope.querySelector("s");
  expect(was?.textContent).toBe("£350/yr");
  expect(was?.getAttribute("aria-label")).toBe("was £350/yr");
  expect(was?.nextElementSibling?.tagName).toBe("STRONG");
  expect(scope.querySelector("strong")?.textContent).toBe("£250 once");
  expect(scope.textContent).toContain(PLAN_LINE);
}

function expectLifetimeAction(button: HTMLElement, buttonText = "Get the Lifetime deal") {
  const scope = lifetimeButtonScope(button, buttonText);
  expect(scope.textContent).toContain(PLAN_LINE);
}
const soldOutCount = { offered: true, sold_out: true };

function planForms(container: HTMLElement): HTMLFormElement[] {
  return Array.from(container.querySelectorAll("form"));
}

describe("lifetime price lead", () => {
  it("puts the struck-through annual price first, then the bold one-time price and plan line", () => {
    const { container } = render(<FoundingPriceLead />);
    const struck = container.querySelector('s[aria-label="was £350/yr"]');
    expect(struck?.textContent).toBe("£350/yr");
    expect(struck?.nextElementSibling?.textContent).toBe("£250 once");
    expect(container.textContent).toContain("£350/yr£250 once");
    expect(screen.getByText(PLAN_LINE)).toBeTruthy();
    expect((container.textContent?.match(/Limited places/g) ?? []).length).toBe(1);
    expect(container.textContent).not.toMatch(/\d+\s*places?/i);
    expect(container.textContent).not.toMatch(/\d+\s*places?\s*(left|remaining)|of\s*\d+/i);
    expect(screen.queryByText("£290/yr for as long as you stay subscribed")).toBeNull();
    expect(container.textContent).not.toMatch(/billed|places left/i);
    expect(container.textContent).not.toMatch(/founding|£290|£24\.17|stay subscribed/i);
  });
});

describe("lifetime pricing cards", () => {
  it("shows the Lifetime offer with a count-free limited-places label and no old founding price", () => {
    const { container } = render(
      <PricingPlans signedIn founding={openCount} />,
    );

    expect(screen.getByRole("heading", { name: "Pricing" })).toBeTruthy();
    expect((container.textContent?.match(/Limited places/g) ?? []).length).toBe(1);
    expect(container.textContent).not.toMatch(/\d+\s*places?/i);
    expect(container.textContent).not.toMatch(/\d+\s*places?\s*(left|remaining)|of\s*\d+/i);
    expect(container.textContent).not.toContain("Founding places available");
    expect(container.textContent).not.toMatch(/\d+\s+places?\s+left/i);
    expect(screen.getByText(PLAN_LINE)).toBeTruthy();
    expect(container.textContent).toContain("£250 once");
    expect(container.textContent).not.toMatch(/founding|£290|£24\.17|stay subscribed/i);
    expect(screen.getByText("billed £350/yr, VAT included")).toBeTruthy();
    expect(container.querySelector('s[aria-label="was £350/yr"]')).toBeTruthy();
    expect(container.querySelector('s[aria-label="was £39 a month"]')).toBeTruthy();
    expect(container.textContent).not.toMatch(/of 25/);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.textContent).not.toMatch(/competitor/i);
    expect(container.textContent).not.toMatch(/Example value/i);
    expect(container.textContent).not.toMatch(/only today|testimonial|#1/i);

    const forms = planForms(container);
    const foundingForms = forms.filter((form) => planKeyOf(form) === FOUNDING_PLAN_KEY);
    const annualForms = forms.filter((form) => planKeyOf(form) === "PRO_ANNUAL");
    expect(foundingForms).toHaveLength(1);
    expect(foundingForms[0]?.textContent).toMatch(/Get the Lifetime deal/);
    expect(annualForms).toHaveLength(1);
    expect(annualForms[0]?.textContent).toMatch(/Start Pro annual/);
    expect(forms.map(planKeyOf)).not.toContain("FOUNDING");
    expect(forms.every((form) => !form.querySelector("input[name='product_id']"))).toBe(true);
  });

  it("shows a count-free limited-places label and no extra urgency", () => {
    const { container } = render(<PricingPlans signedIn founding={openCount} />);
    expect((container.textContent?.match(/Limited places/g) ?? []).length).toBe(1);
    expect(container.textContent).not.toMatch(/\d+\s*places?/i);
    expect(container.textContent).not.toMatch(/\d+\s*places?\s*(left|remaining)|of\s*\d+/i);
    expect(container.textContent).not.toMatch(/\d+\s+places?\s+left/i);
    expect(container.textContent).not.toMatch(/only today|hurry|almost gone/i);
    expect(container.textContent).not.toMatch(/founding|£290|£24\.17|stay subscribed/i);
  });

  it("removes the Lifetime card when sold out and shows a count-free note", () => {
    const { container } = render(
      <PricingPlans signedIn={false} founding={soldOutCount} />,
    );
    expect(screen.getByText(/The Lifetime deal is sold out\./)).toBeTruthy();
    expect(container.textContent).not.toMatch(/founding|£290|£24\.17|stay subscribed/i);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Free",
      "Pro monthly",
      "Pro annual",
    ]);
    expect(screen.getByText("Recommended")).toBeTruthy();
    expect(screen.queryByText("Get the Lifetime deal")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Lifetime deal" })).toBeNull();
    expect(container.querySelector("input[name='offer']")).toBeNull();
    expect(screen.getByRole("link", { name: /Start Pro annual/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create free account" })).toBeTruthy();
  });
});

describe("lifetime deal paywall", () => {
  it("posts one-time Lifetime checkout for a signed-in free user", () => {
    const { container } = render(
      <UnlockPanel
        mode="free"
        founding={openCount}
        returnTo="/app/deals/22222222-2222-4222-8222-222222222222"
      />,
    );
    const cta = screen.getByRole("button", { name: /^Get the Lifetime deal/ });
    expectLifetimeAction(cta);
    expect((container.textContent?.match(/Limited places/g) ?? []).length).toBe(1);
    expect(container.textContent).not.toMatch(/\d+\s*places?/i);
    expect(container.textContent).not.toMatch(/\d+\s*places?\s*(left|remaining)|of\s*\d+/i);
    expect(screen.getByText(PLAN_LINE)).toBeTruthy();
    expect(container.textContent).not.toMatch(/founding|£290|£24\.17|stay subscribed/i);
    expect(container.textContent).not.toMatch(/billed/i);
    expect(container.textContent).not.toMatch(/\d+\s+places?\s+left/i);
    const founding = planForms(container).find(
      (form) =>
        planKeyOf(form) === FOUNDING_PLAN_KEY &&
        form.querySelector("button")?.textContent?.includes("Lifetime deal"),
    );
    expect(founding?.querySelector("input[name='returnTo']")?.getAttribute("value")).toBe(
      "/app/deals/22222222-2222-4222-8222-222222222222",
    );
    expect(planForms(container).map(planKeyOf)).not.toContain("FOUNDING");
    expect(container.textContent).not.toMatch(/Example value|@|buyer@/i);
  });

  it("falls back to standard prices when Lifetime is sold out", () => {
    const { container } = render(<UnlockPanel mode="free" founding={soldOutCount} />);
    expect(screen.getByRole("button", { name: "Start Pro – £39/mo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Or Pro annual/ })).toBeTruthy();
    expect(container.querySelector("input[name='offer']")).toBeNull();
    expect(
      container.querySelector("input[name='planKey'][value='PRO_ANNUAL']"),
    ).toBeTruthy();
  });

  it("keeps the standard unlock when Lifetime is not offered", () => {
    render(<UnlockPanel mode="anonymous" />);
    expect(screen.getByRole("link", { name: "Unlock with DealAtlas Pro" })).toBeTruthy();
    expect(screen.queryByText(/founding/i)).toBeNull();
  });
});

describe("Lifetime checkout race", () => {
  it("offers standard plans and keeps the deal return without a Lifetime offer", () => {
    const { container } = render(
      <FoundingFullNotice
        signedIn
        loginHref="/login"
        returnTo="/deals/grounds-maintenance"
        returnTitle="Grounds maintenance for community sites"
      />,
    );
    expect(
      screen.getByText("The Lifetime deal just sold out. You haven't been charged."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue with annual/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose monthly – £39/mo" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Grounds maintenance for community sites" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/founding|£290|£24\.17|stay subscribed/i);
    expect(container.querySelector("input[name='offer']")).toBeNull();
    const keys = Array.from(container.querySelectorAll("input[name='planKey']")).map((input) =>
      input.getAttribute("value"),
    );
    expect(keys.sort()).toEqual(["PRO_ANNUAL", "PRO_MONTHLY"]);
  });
});

describe("founding billing summary", () => {
  it("shows a legacy founding annual member as Pro annual without the old founding price", () => {
    const { container } = render(
      <BillingSummary
        entitlement={{
          plan: "PRO",
          status: "ACTIVE",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          billingInterval: "ANNUAL",
          planKey: "PRO_ANNUAL",
        }}
        hasCustomerPortal={false}
        foundingMember
      />,
    );
    expect(screen.getByText("Pro annual")).toBeTruthy();
    expect(container.textContent).not.toContain("£290");
    expect(container.textContent).not.toContain("£24.17");
    expect(container.textContent).not.toContain("Founding");
    expect(container.textContent).not.toMatch(/founding|£290|£24\.17|stay subscribed/i);
    expect(container.textContent).not.toContain("Limited places");
    expect(container.textContent).not.toMatch(/\d+\s+places?\s+left/i);
  });
});

describe("Lifetime checkout summary", () => {
  it("shows the price next to every Lifetime button, never inside it", () => {
    for (const { ui, hasPrice } of [
      { ui: <PricingPlans key="p" signedIn founding={openCount} />, hasPrice: true },
      { ui: <HomeFoundingCta key="h" signedIn founding={openCount} />, hasPrice: true },
      { ui: <DealProCard key="d" mode="free" founding={openCount} alertsHref="/app/alerts" />, hasPrice: false },
      { ui: <DealProCard key="a" mode="anonymous" founding={openCount} alertsHref="/signup" />, hasPrice: false },
    ]) {
      const { container, unmount } = render(ui);
      const node =
        screen.queryByRole("button", { name: /^Get the Lifetime deal/ }) ??
        screen.getByRole("link", { name: /^Get the Lifetime deal/ });
      if (hasPrice) {
        expectFoundingPriceInside(node);
      } else {
        expectLifetimeAction(node);
      }
      expect(container.textContent).not.toMatch(/founding|£290|£24\.17|stay subscribed/i);
      unmount();
    }
  });

  it("shows the one-time price, due today and a count-free limited-places label", () => {
    const { container } = render(<FoundingCheckoutSummary founding={openCount} />);
    expect((container.textContent?.match(/Limited places/g) ?? []).length).toBe(1);
    expect(container.textContent).not.toMatch(/\d+\s*places?/i);
    expect(container.textContent).not.toMatch(/\d+\s*places?\s*(left|remaining)|of\s*\d+/i);
    expect(container.textContent).not.toMatch(/\d+\s+places?\s+left/i);
    expect(screen.getByText(PLAN_LINE)).toBeTruthy();
    expect(container.textContent).not.toMatch(/founding|£290|£24\.17|stay subscribed/i);
    expect(container.textContent).not.toMatch(/billed/i);
    expect(screen.getByText("Due today")).toBeTruthy();
    expect(screen.getByText("£250.00")).toBeTruthy();
    expect(screen.getByText("One-time payment · no renewal")).toBeTruthy();
    expect(container.querySelector('s[aria-label="was £350/yr"]')?.textContent).toBe("£350/yr");
    const pay = screen.getByRole("button", { name: /^Continue to payment/ });
    expectFoundingPriceInside(pay, "Continue to payment");
    expect(planKeyOf(pay.closest("form")!)).toBe(FOUNDING_PLAN_KEY);
    expect(screen.getByRole("button", { name: "Switch to Pro £39/mo instead" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/of 25|25 places/);
    expect(container.textContent).not.toMatch(/competitor/i);
  });
});

describe("Lifetime plan key", () => {
  it("is founding_lifetime and the full Lifetime copy matches the server", () => {
    expect(FOUNDING_PLAN_KEY).toBe("founding_lifetime");
    expect(FOUNDING_FULL_MESSAGE).toBe(
      "The Lifetime deal is sold out. You can still subscribe to Pro annual at £350/year.",
    );
    expect(FOUNDING_FULL_MESSAGE).not.toMatch(/founding/i);
  });

  it("sends signed-out Lifetime CTAs to signup then the Lifetime checkout", () => {
    const { container } = render(<PricingPlans signedIn={false} founding={openCount} />);
    const link = screen.getByRole("link", { name: /Get the Lifetime deal/i });
    expect(link.getAttribute("href")).toBe(foundingSignupPath());
    expect(decodeURIComponent(foundingSignupPath())).toContain("/checkout?plan=lifetime");
    expect(container.textContent).not.toMatch(/founding|£290|£24\.17/);
  });

  it("posts founding_lifetime from the homepage band", () => {
    const { container } = render(<HomeFoundingCta signedIn founding={openCount} />);
    const keys = planForms(container).map(planKeyOf);
    expect(keys).toContain(FOUNDING_PLAN_KEY);
    expect(keys).not.toContain("FOUNDING");
    expect(container.textContent).not.toMatch(/founding|£290|£24\.17/);
  });
});

function stubCheckoutResponse(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Lifetime full error state", () => {
  it.each([
    ["pricing", () => <PricingPlans signedIn founding={openCount} />, /Get the Lifetime deal/],
    ["homepage band", () => <HomeFoundingCta signedIn founding={openCount} />, /Get the Lifetime deal/],
    ["checkout", () => <FoundingCheckoutSummary founding={openCount} />, /Continue to payment/],
  ])("shows the full Lifetime message with a Pro annual fallback on %s", async (_where, ui, buttonName) => {
    const fetchMock = stubCheckoutResponse(409, { code: "FOUNDING_CAP_FULL", message: FOUNDING_FULL_MESSAGE });
    const { container } = render(ui());
    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(FOUNDING_FULL_MESSAGE);
    const fallback = within(alert).getByRole("button", { name: /Start Pro annual/ });
    expect(planKeyOf(fallback.closest("form")!)).toBe("PRO_ANNUAL");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/billing/checkout");
    expect(JSON.parse(String(init.body)).planKey).toBe(FOUNDING_PLAN_KEY);
    expect(new Headers(init.headers).get("accept")).toContain("application/json");
    expect(container.textContent).not.toMatch(/of 25|25 places/);
    expect(container.textContent).not.toMatch(/founding|£290|£24\.17|stay subscribed/i);
  });

  it("ignores a Founding server message for FOUNDING_CAP_FULL and shows the Lifetime full message", async () => {
    stubCheckoutResponse(409, { code: "FOUNDING_CAP_FULL", message: "Founding places are all taken." });
    render(<FoundingCheckoutButton label="Get the Lifetime deal" returnTo="/pricing" />);
    fireEvent.click(screen.getByRole("button", { name: "Get the Lifetime deal" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(FOUNDING_FULL_MESSAGE);
    expect(alert.textContent).not.toContain("Founding places are all taken.");
    expect(within(alert).getByRole("button", { name: /Start Pro annual/ })).toBeTruthy();
  });

  it("falls back to the local Lifetime copy when FOUNDING_CAP_FULL has no message", async () => {
    stubCheckoutResponse(409, { code: "FOUNDING_CAP_FULL" });
    render(<FoundingCheckoutButton label="Get the Lifetime deal" returnTo="/pricing" />);
    fireEvent.click(screen.getByRole("button", { name: "Get the Lifetime deal" }));
    expect((await screen.findByRole("alert")).textContent).toContain(FOUNDING_FULL_MESSAGE);
  });

  it.each([
    ["INVALID_PLAN", 400, { code: "INVALID_PLAN" }],
    ["full text without the code", 409, { message: FOUNDING_FULL_MESSAGE }],
    ["unknown error", 500, { code: "SOMETHING_ELSE", message: "Internal detail" }],
  ])("shows a generic error with no annual fallback for %s", async (_name, status, body) => {
    stubCheckoutResponse(status, body);
    render(<FoundingCheckoutButton label="Get the Lifetime deal" returnTo="/pricing" />);
    fireEvent.click(screen.getByRole("button", { name: "Get the Lifetime deal" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Checkout could not be started. Try again.");
    expect(screen.queryByRole("button", { name: /Start Pro annual/ })).toBeNull();
  });

  it("redirects to the checkout url on success", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    stubCheckoutResponse(200, { checkout_url: "https://checkout.example/session" });
    render(<FoundingCheckoutButton label="Get the Lifetime deal" returnTo="/pricing" />);
    fireEvent.click(screen.getByRole("button", { name: "Get the Lifetime deal" }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.example/session"));
  });

  it("checkout for a full Lifetime plan shows the message and Pro annual, no Lifetime summary", () => {
    const { container } = render(<FoundingFullCheckout />);
    expect(screen.getByRole("alert").textContent).toBe(FOUNDING_FULL_MESSAGE);
    expect(screen.getByText("billed £350/yr, VAT included")).toBeTruthy();
    expect(container.textContent).toContain("£29.17/mo");
    expect(
      planKeyOf(screen.getByRole("button", { name: /Start Pro annual/ }).closest("form")!),
    ).toBe("PRO_ANNUAL");
    expect(container.querySelectorAll(`input[name='planKey'][value='${FOUNDING_PLAN_KEY}']`)).toHaveLength(0);
    expect(container.textContent).not.toMatch(/founding|£24\.17|£290|stay subscribed|places left|Due today/i);
    expect(container.textContent).not.toMatch(/\d+\s+places?\s+left/i);
    expect(screen.queryByRole("button", { name: "Continue to payment" })).toBeNull();
  });
});

describe("Lifetime pricing note", () => {
  it("says one payment with nothing to renew or cancel", () => {
    render(<PricingPlans signedIn={false} founding={openCount} />);
    expect(
      screen.getByText("One payment. No subscription, nothing to renew."),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/still yours|come back|rejoin/i);
    expect(document.body.textContent).not.toContain("If you cancel");
    expect(document.body.textContent).not.toContain("stay subscribed");
    expect(document.body.textContent).not.toMatch(/founding|£290|£24\.17/i);
  });
});

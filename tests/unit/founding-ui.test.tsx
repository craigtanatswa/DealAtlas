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

function planKeyOf(form: Element): string | null | undefined {
  return form.querySelector("input[name='planKey']")?.getAttribute("value");
}

const openCount = { offered: true, sold_out: false };

/** The one-time lifetime price in bold. */
function expectFoundingPriceInside(button: HTMLElement) {
  expect(button.querySelector("s")).toBeNull();
  expect(button.querySelector("strong")?.textContent).toBe("£250 one-time");
  expect(button.textContent).not.toMatch(/£290|£24\.17|billed|VAT incl/i);
}
const soldOutCount = { offered: true, sold_out: true };

function planForms(container: HTMLElement): HTMLFormElement[] {
  return Array.from(container.querySelectorAll("form"));
}

describe("founding price lead", () => {
  it("shows the bold one-time lifetime price", () => {
    const { container } = render(<FoundingPriceLead />);
    expect(container.querySelector("s")).toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("£250 one-time");
    expect(screen.getByText("Limited places")).toBeTruthy();
    expect(screen.getByText("£250 one-time, lifetime access")).toBeTruthy();
    expect(container.textContent).not.toMatch(/£290|£24\.17|billed|places left/i);
  });
});

describe("founding pricing cards", () => {
  it("shows the limited-places label and a founding offer, not a client price or example label", () => {
    const { container } = render(
      <PricingPlans signedIn founding={openCount} />,
    );

    expect(screen.getByRole("heading", { name: "Pricing" })).toBeTruthy();
    expect(screen.getByText("Limited places")).toBeTruthy();
    expect(container.textContent).not.toContain("Founding places available");
    expect(container.textContent).not.toMatch(/\d+\s+places?\s+left/i);
    expect(screen.getByText("£250 one-time, lifetime access")).toBeTruthy();
    expect(container.textContent).toContain("£250 one-time");
    expect(container.textContent).not.toContain("£24.17/mo");
    expect(container.textContent).not.toContain("£290");
    expect(screen.getByText("billed £350/yr, VAT included")).toBeTruthy();
    expect(container.textContent).not.toMatch(/of 25/);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.textContent).not.toMatch(/competitor/i);
    expect(container.textContent).not.toMatch(/Example value/i);
    expect(container.textContent).not.toMatch(/only today|testimonial|#1/i);

    const forms = planForms(container);
    const foundingForms = forms.filter((form) => planKeyOf(form) === FOUNDING_PLAN_KEY);
    const annualForms = forms.filter((form) => planKeyOf(form) === "PRO_ANNUAL");
    expect(foundingForms).toHaveLength(1);
    expect(foundingForms[0]?.textContent).toMatch(/Lifetime deal/i);
    expect(annualForms).toHaveLength(1);
    expect(annualForms[0]?.textContent).toMatch(/Start Pro annual/);
    expect(forms.every((form) => !form.querySelector("input[name='product_id']"))).toBe(true);
  });

  it("shows the same limited-places label without extra urgency", () => {
    const { container } = render(<PricingPlans signedIn founding={openCount} />);
    expect(screen.getByText("Limited places")).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d+\s+places?\s+left/i);
    expect(container.textContent).not.toMatch(/only today|hurry|almost gone/i);
  });

  it("removes the founding card when sold out and shows a count-free note", () => {
    const { container } = render(
      <PricingPlans signedIn={false} founding={soldOutCount} />,
    );
    expect(screen.getByText(FOUNDING_FULL_MESSAGE)).toBeTruthy();
    expect(container.textContent).not.toMatch(/Get the Lifetime deal|£250|£290|£24\.17|for as long as you stay subscribed/i);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Free",
      "Pro monthly",
      "Pro annual",
    ]);
    expect(screen.getByText("Recommended")).toBeTruthy();
    expect(screen.queryByText("Get the Lifetime deal")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Pro Lifetime deal" })).toBeNull();
    expect(container.querySelector("input[name='offer']")).toBeNull();
    expect(screen.getByRole("link", { name: /Start Pro annual/ })).toBeTruthy();
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
    const cta = screen.getByRole("button", { name: /^Get the Lifetime deal/ });
    expectFoundingPriceInside(cta);
    expect(screen.getByText("Limited places")).toBeTruthy();
    expect(screen.getByText("£250 one-time, lifetime access")).toBeTruthy();
    expect(container.textContent).toContain("£250 one-time");
    expect(container.textContent).not.toMatch(/billed|VAT incl/i);
    expect(container.textContent).not.toMatch(/\d+\s+places?\s+left/i);
    const founding = planForms(container).find(
      (form) =>
        planKeyOf(form) === FOUNDING_PLAN_KEY &&
        form.querySelector("button")?.textContent?.includes("Lifetime deal"),
    );
    expect(founding?.querySelector("input[name='returnTo']")?.getAttribute("value")).toBe(
      "/app/deals/22222222-2222-4222-8222-222222222222",
    );
    expect(container.textContent).not.toMatch(/Example value|@|buyer@/i);
  });

  it("falls back to standard prices when founding is sold out", () => {
    const { container } = render(<UnlockPanel mode="free" founding={soldOutCount} />);
    expect(screen.getByRole("button", { name: "Start Pro – £39/mo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Or Pro annual/ })).toBeTruthy();
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
      screen.getByText("The Lifetime deal just sold out. You haven't been charged."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue with annual/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose monthly – £39/mo" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Grounds maintenance for community sites" })).toBeTruthy();
    expect(container.querySelector("input[name='offer']")).toBeNull();
    const keys = Array.from(container.querySelectorAll("input[name='planKey']")).map((input) =>
      input.getAttribute("value"),
    );
    expect(keys.sort()).toEqual(["PRO_ANNUAL", "PRO_MONTHLY"]);
  });
});

describe("founding billing summary", () => {
  it("uses the shared founding price format for an existing founding member, without places copy", () => {
    const { container } = render(
      <BillingSummary
        entitlement={{
          plan: "PRO",
          status: "ACTIVE",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          billingInterval: null,
          planKey: "founding_lifetime",
          term: "lifetime",
        }}
        hasCustomerPortal={false}
        foundingMember
      />,
    );
    expect(container.textContent).toContain("£250 one-time");
    expect(container.textContent).not.toContain("£290");
    expect(container.textContent).not.toContain("Limited places");
    expect(screen.getByText("£250 one-time, lifetime access")).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d+\s+places?\s+left/i);
  });
});

describe("founding checkout summary", () => {
  it("puts the struck-through and founding price inside every founding button", () => {
    for (const ui of [
      <PricingPlans key="p" signedIn founding={openCount} />,
      <HomeFoundingCta key="h" signedIn founding={openCount} />,
      <DealProCard key="d" mode="free" founding={openCount} alertsHref="/app/alerts" />,
      <DealProCard key="a" mode="anonymous" founding={openCount} alertsHref="/signup" />,
    ]) {
      const { unmount } = render(ui);
      const node =
        screen.queryByRole("button", { name: /^Get the Lifetime deal/ }) ??
        screen.getByRole("link", { name: /^Get the Lifetime deal/ });
      expectFoundingPriceInside(node);
      unmount();
    }
  });

  it("shows the monthly-equivalent price, due today and a limited-places label only", () => {
    const { container } = render(<FoundingCheckoutSummary founding={openCount} />);
    expect(screen.getByText("Limited places")).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d+\s+places?\s+left/i);
    expect(container.textContent).toContain("£250 one-time");
    expect(container.textContent).not.toMatch(/£290|£24\.17|billed|VAT incl/i);
    expect(screen.getByText("Due today")).toBeTruthy();
    expect(screen.getByText("£250.00")).toBeTruthy();
    expect(container.querySelector("s")).toBeNull();
    const pay = screen.getByRole("button", { name: /^Continue to payment/ });
    expectFoundingPriceInside(pay);
    expect(planKeyOf(pay.closest("form")!)).toBe(FOUNDING_PLAN_KEY);
    expect(screen.getByRole("button", { name: "Switch to Pro £39/mo instead" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/of 25|25 places/);
    expect(container.textContent).not.toMatch(/competitor/i);
  });
});

describe("founding plan key", () => {
  it("is founding_lifetime and the unavailable copy matches the server", () => {
    expect(FOUNDING_PLAN_KEY).toBe("founding_lifetime");
    expect(FOUNDING_FULL_MESSAGE).toBe(
      "The Lifetime deal is no longer available. You can still subscribe to Pro annual at £350/year.",
    );
  });

  it("sends signed-out founding CTAs to signup then the founding checkout", () => {
    render(<PricingPlans signedIn={false} founding={openCount} />);
    const link = screen.getByRole("link", { name: /Lifetime deal/i });
    expect(link.getAttribute("href")).toBe(foundingSignupPath());
    expect(decodeURIComponent(foundingSignupPath())).toContain(
      "/checkout?plan=founding_lifetime",
    );
  });

  it("posts founding_lifetime from the homepage band", () => {
    const { container } = render(<HomeFoundingCta signedIn founding={openCount} />);
    expect(planForms(container).map(planKeyOf)).toContain(FOUNDING_PLAN_KEY);
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

describe("founding full error state", () => {
  it.each([
    ["pricing", () => <PricingPlans signedIn founding={openCount} />, /Lifetime deal/i],
    ["homepage band", () => <HomeFoundingCta signedIn founding={openCount} />, /Lifetime deal/i],
    ["checkout", () => <FoundingCheckoutSummary founding={openCount} />, /Continue to payment/],
  ])("shows the server message with a Pro annual fallback on %s", async (_where, ui, buttonName) => {
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
  });

  it("shows the server message for FOUNDING_CAP_FULL, not the local copy", async () => {
    stubCheckoutResponse(409, { code: "FOUNDING_CAP_FULL", message: "Server copy wins." });
    render(<FoundingCheckoutButton label="Get the Lifetime deal" returnTo="/pricing" />);
    fireEvent.click(screen.getByRole("button", { name: "Get the Lifetime deal" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Server copy wins.");
    expect(alert.textContent).not.toContain(FOUNDING_FULL_MESSAGE);
    expect(within(alert).getByRole("button", { name: /Start Pro annual/ })).toBeTruthy();
  });

  it("falls back to the local copy when FOUNDING_CAP_FULL has no message", async () => {
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

  it("checkout for a full founding plan shows the message and Pro annual, no founding summary", () => {
    const { container } = render(<FoundingFullCheckout />);
    expect(screen.getByRole("alert").textContent).toBe(FOUNDING_FULL_MESSAGE);
    expect(screen.getByText("billed £350/yr, VAT included")).toBeTruthy();
    expect(container.textContent).toContain("£29.17/mo");
    expect(
      planKeyOf(screen.getByRole("button", { name: /Start Pro annual/ }).closest("form")!),
    ).toBe("PRO_ANNUAL");
    expect(container.querySelectorAll(`input[name='planKey'][value='${FOUNDING_PLAN_KEY}']`)).toHaveLength(0);
    expect(container.textContent).not.toMatch(/£24\.17|£290|£250|for as long as you stay subscribed|places left|Due today/);
    expect(container.textContent).not.toMatch(/\d+\s+places?\s+left/i);
    expect(screen.queryByRole("button", { name: "Continue to payment" })).toBeNull();
  });
});

describe("founding cancellation line", () => {
  it("says the Lifetime deal is a one-time payment that never renews", () => {
    render(<PricingPlans signedIn={false} founding={openCount} />);
    expect(
      screen.getByText("The Lifetime deal is a one-time payment and never renews."),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/still yours|come back|rejoin/i);
  });
});

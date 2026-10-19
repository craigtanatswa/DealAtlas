// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FoundingFullNotice } from "@/components/billing/founding-full-notice";
import { PricingPlans } from "@/components/billing/pricing-plans";
import {
  FoundingCheckoutSummary,
  FoundingFullCheckout,
} from "@/components/billing/founding-checkout-summary";
import { UnlockPanel } from "@/components/deals/unlock-panel";
import { FoundingCheckoutButton } from "@/components/billing/founding-checkout-button";
import { HomeFoundingCta } from "@/components/marketing/home-founding-cta";
import {
  FOUNDING_CAP,
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
    expect(screen.getByText("17 places left")).toBeTruthy();
    expect(screen.getByText("£290/yr for as long as you stay subscribed")).toBeTruthy();
    expect(screen.getByText("billed £290/yr, VAT included")).toBeTruthy();
    expect(screen.getByText("£24.17")).toBeTruthy();
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
    expect(foundingForms[0]?.textContent).toMatch(/founding member/i);
    expect(annualForms).toHaveLength(1);
    expect(annualForms[0]?.textContent).toMatch(/Start Pro annual/);
    expect(forms.every((form) => !form.querySelector("input[name='product_id']"))).toBe(true);
  });

  it("uses the last-place sentence and no extra urgency", () => {
    const { container } = render(
      <PricingPlans signedIn count={lastCount} state="last" />,
    );
    expect(screen.getByText("Last founding place · 1 place left")).toBeTruthy();
    expect(container.textContent).not.toMatch(/only today|hurry|almost gone/i);
  });

  it.each([
    ["full", soldOutCount, "sold_out"],
    ["not offered", { offered: false, remaining: 0, cap: FOUNDING_CAP }, "hidden"],
  ] as const)("removes the founding card completely when founding is %s", (_name, count, state) => {
    const { container } = render(<PricingPlans signedIn={false} count={count} state={state} />);
    expect(container.textContent).not.toMatch(/founding/i);
    expect(container.textContent).not.toMatch(/£290|£24\.17|for as long as you stay subscribed|sold out|all taken/i);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Free",
      "Pro monthly",
      "Pro annual",
    ]);
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
    expect(screen.getByText(/17 places left/)).toBeTruthy();
    expect(screen.getByText(/£290\/yr for as long as you stay subscribed/)).toBeTruthy();
    const founding = planForms(container).find(
      (form) =>
        planKeyOf(form) === FOUNDING_PLAN_KEY &&
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
    expect(screen.getByRole("button", { name: "or £350/yr (save 25%)" })).toBeTruthy();
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
    expect(screen.getByRole("button", { name: "Continue with annual – £350/yr" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose monthly – £39/mo" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Grounds maintenance for community sites" })).toBeTruthy();
    expect(container.querySelector("input[name='offer']")).toBeNull();
    const keys = Array.from(container.querySelectorAll("input[name='planKey']")).map((input) =>
      input.getAttribute("value"),
    );
    expect(keys.sort()).toEqual(["PRO_ANNUAL", "PRO_MONTHLY"]);
  });
});

describe("founding checkout summary", () => {
  it("shows the monthly-equivalent price, due today and remaining places only", () => {
    const { container } = render(<FoundingCheckoutSummary remaining={24} cap={25} />);
    expect(screen.getByText("24 places left")).toBeTruthy();
    expect(screen.getByText("£24.17")).toBeTruthy();
    expect(screen.getByText("billed £290/yr, VAT included")).toBeTruthy();
    expect(screen.getByText("Due today")).toBeTruthy();
    expect(screen.getByText("£290.00")).toBeTruthy();
    expect(container.querySelector('s[aria-label="was £39 a month"]')?.textContent).toBe("£39/mo");
    const pay = screen.getByRole("button", { name: "Continue to payment" });
    expect(planKeyOf(pay.closest("form")!)).toBe(FOUNDING_PLAN_KEY);
    expect(screen.getByRole("button", { name: "Switch to Pro £39/mo instead" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/of 25|25 places/);
    expect(container.textContent).not.toMatch(/competitor/i);
  });
});

describe("founding plan key", () => {
  it("is FOUNDING and the full-founding copy matches the server", () => {
    expect(FOUNDING_PLAN_KEY).toBe("FOUNDING");
    expect(FOUNDING_FULL_MESSAGE).toBe(
      "Founding places are all taken. You can still subscribe to Pro annual at £350/year.",
    );
  });

  it("sends signed-out founding CTAs to signup then the founding checkout", () => {
    render(<PricingPlans signedIn={false} count={openCount} state="available" />);
    const link = screen.getByRole("link", { name: /founding member/i });
    expect(link.getAttribute("href")).toBe(foundingSignupPath());
    expect(decodeURIComponent(foundingSignupPath())).toContain("/checkout?plan=FOUNDING");
  });

  it("posts FOUNDING from the homepage band", () => {
    const { container } = render(<HomeFoundingCta signedIn remaining={17} cap={FOUNDING_CAP} />);
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
    ["pricing", () => <PricingPlans signedIn count={openCount} state="available" />, /founding member/i],
    ["homepage band", () => <HomeFoundingCta signedIn remaining={17} cap={FOUNDING_CAP} />, /founding member/i],
    ["checkout", () => <FoundingCheckoutSummary remaining={3} cap={FOUNDING_CAP} />, /Continue to payment/],
  ])("shows the server message with a Pro annual fallback on %s", async (_where, ui, buttonName) => {
    const fetchMock = stubCheckoutResponse(409, { code: "FOUNDING_CAP_FULL", message: FOUNDING_FULL_MESSAGE });
    const { container } = render(ui());
    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(FOUNDING_FULL_MESSAGE);
    const fallback = within(alert).getByRole("button", { name: "Start Pro annual" });
    expect(planKeyOf(fallback.closest("form")!)).toBe("PRO_ANNUAL");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/billing/checkout");
    expect(JSON.parse(String(init.body)).planKey).toBe(FOUNDING_PLAN_KEY);
    expect(new Headers(init.headers).get("accept")).toContain("application/json");
    expect(container.textContent).not.toMatch(/of 25|25 places/);
  });

  it("shows the server message for FOUNDING_CAP_FULL, not the local copy", async () => {
    stubCheckoutResponse(409, { code: "FOUNDING_CAP_FULL", message: "Server copy wins." });
    render(<FoundingCheckoutButton label="Become a founding member" returnTo="/pricing" />);
    fireEvent.click(screen.getByRole("button", { name: "Become a founding member" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Server copy wins.");
    expect(alert.textContent).not.toContain(FOUNDING_FULL_MESSAGE);
    expect(within(alert).getByRole("button", { name: "Start Pro annual" })).toBeTruthy();
  });

  it("falls back to the local copy when FOUNDING_CAP_FULL has no message", async () => {
    stubCheckoutResponse(409, { code: "FOUNDING_CAP_FULL" });
    render(<FoundingCheckoutButton label="Become a founding member" returnTo="/pricing" />);
    fireEvent.click(screen.getByRole("button", { name: "Become a founding member" }));
    expect((await screen.findByRole("alert")).textContent).toContain(FOUNDING_FULL_MESSAGE);
  });

  it.each([
    ["INVALID_PLAN", 400, { code: "INVALID_PLAN" }],
    ["full text without the code", 409, { message: FOUNDING_FULL_MESSAGE }],
    ["unknown error", 500, { code: "SOMETHING_ELSE", message: "Internal detail" }],
  ])("shows a generic error with no annual fallback for %s", async (_name, status, body) => {
    stubCheckoutResponse(status, body);
    render(<FoundingCheckoutButton label="Become a founding member" returnTo="/pricing" />);
    fireEvent.click(screen.getByRole("button", { name: "Become a founding member" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Checkout could not be started. Try again.");
    expect(screen.queryByRole("button", { name: "Start Pro annual" })).toBeNull();
  });

  it("redirects to the checkout url on success", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    stubCheckoutResponse(200, { checkout_url: "https://checkout.example/session" });
    render(<FoundingCheckoutButton label="Become a founding member" returnTo="/pricing" />);
    fireEvent.click(screen.getByRole("button", { name: "Become a founding member" }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.example/session"));
  });

  it("checkout for a full founding plan shows the message and Pro annual, no founding summary", () => {
    const { container } = render(<FoundingFullCheckout />);
    expect(screen.getByRole("alert").textContent).toBe(FOUNDING_FULL_MESSAGE);
    expect(screen.getByText("£350")).toBeTruthy();
    expect(planKeyOf(screen.getByRole("button", { name: "Start Pro annual" }).closest("form")!)).toBe(
      "PRO_ANNUAL",
    );
    expect(container.querySelectorAll(`input[name='planKey'][value='${FOUNDING_PLAN_KEY}']`)).toHaveLength(0);
    expect(container.textContent).not.toMatch(/£24\.17|£290|for as long as you stay subscribed|places left|Due today/);
    expect(screen.queryByRole("button", { name: "Continue to payment" })).toBeNull();
  });
});

describe("founding cancellation line", () => {
  it("says cancelling loses founding status and the £290/yr price", () => {
    render(<PricingPlans signedIn={false} count={openCount} state="available" />);
    expect(
      screen.getByText("If you cancel, you lose founding status and the £290/yr price."),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/still yours|come back|rejoin/i);
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real isProAnnualEnabled(); only the server env it reads is faked.
const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  founding: { offered: true, sold_out: false } as { offered: boolean; sold_out: boolean } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => mocks.env }));
vi.mock("@/lib/auth/session", () => ({
  getAuthUser: vi.fn(async () => null),
  requireUser: vi.fn(async () => ({ user: { id: "user-1" }, profile: {} })),
}));
vi.mock("@/lib/auth/urls", () => ({ getAppOrigin: () => "https://www.dealatlas.example" }));
vi.mock("@/lib/billing/founding-public", () => ({
  readFoundingPublicCount: vi.fn(async () => mocks.founding),
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
import PricingPage from "@/app/(marketing)/pricing/page";
import { FoundingCheckoutButton } from "@/components/billing/founding-checkout-button";
import { FoundingFullCheckout } from "@/components/billing/founding-checkout-summary";
import { FoundingFullNotice } from "@/components/billing/founding-full-notice";
import { FoundingUnlockActions } from "@/components/billing/founding-unlock-actions";
import { PricingPlans } from "@/components/billing/pricing-plans";
import { DealProCard } from "@/components/deals/deal-pro-card";
import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { UnlockPanel } from "@/components/deals/unlock-panel";
import { DEAL_PREVIEW_DETAIL_FIXTURE } from "@/components/deals/fixtures";

const ANNUAL_ID = "pdt_secret_annual_product";
const ON = { DODO_PRO_ANNUAL_PRODUCT_ID: ANNUAL_ID, SHOW_ANNUAL: "true" };
const OFF = { DODO_PRO_ANNUAL_PRODUCT_ID: ANNUAL_ID };
const OPEN = { offered: true, sold_out: false };
const SOLD_OUT = { offered: true, sold_out: true };
const NOT_OFFERED = { offered: false, sold_out: false };

/** Any trace of the annual plan: name, price, per-month price or plan key. */
const ANNUAL_MARKERS = /annual|£29\.17|£350|PRO_ANNUAL/i;

function html(ui: ReactElement): string {
  const { container, unmount } = render(ui);
  const out = container.innerHTML;
  unmount();
  return out;
}

beforeEach(() => {
  mocks.env = { ...OFF };
  mocks.founding = OPEN;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/pricing reads the server flag", () => {
  it.each([
    ["open", OPEN],
    ["sold out", SOLD_OUT],
    ["not offered", NOT_OFFERED],
  ])("flag off, founding %s: no annual card, monthly stays", async (_label, founding) => {
    mocks.env = { ...OFF };
    mocks.founding = founding;
    const out = html(await PricingPage());
    expect(out).not.toMatch(ANNUAL_MARKERS);
    expect(out).toContain("Pro monthly");
    expect(out).toContain("£39");
    expect(out).not.toContain(ANNUAL_ID);
  });

  it("flag on: annual card renders, product id never does", async () => {
    mocks.env = { ...ON };
    const out = html(await PricingPage());
    expect(out).toContain("Pro annual");
    expect(out).toContain("£29.17");
    expect(out).toContain("PRO_ANNUAL");
    expect(out).not.toContain(ANNUAL_ID);
  });
});

describe("PricingPlans layout", () => {
  function grid(ui: ReactElement): string {
    const { container } = render(ui);
    return container.querySelector(".grid")?.className ?? "";
  }

  it("annual off + founding open: three columns (Free, Founding, Monthly)", () => {
    render(<PricingPlans signedIn={false} founding={OPEN} annualEnabled={false} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Free",
      "Founding member Pro",
      "Pro monthly",
    ]);
    cleanup();
    expect(grid(<PricingPlans signedIn={false} founding={OPEN} annualEnabled={false} />)).toContain(
      "lg:grid-cols-3",
    );
  });

  it("annual off + no founding: two centred columns and monthly is recommended", () => {
    render(<PricingPlans signedIn={false} founding={SOLD_OUT} annualEnabled={false} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Free",
      "Pro monthly",
    ]);
    expect(screen.getByText("Recommended")).toBeTruthy();
    expect(screen.getByText(/Founding membership is full\./).textContent).not.toMatch(ANNUAL_MARKERS);
    cleanup();
    const cls = grid(<PricingPlans signedIn={false} founding={SOLD_OUT} annualEnabled={false} />);
    expect(cls).toContain("md:grid-cols-2");
    expect(cls).not.toMatch(/lg:grid-cols-[34]/);
  });

  it("annual on keeps the existing four and three column layouts", () => {
    expect(grid(<PricingPlans signedIn={false} founding={OPEN} annualEnabled />)).toContain("lg:grid-cols-4");
    cleanup();
    expect(grid(<PricingPlans signedIn={false} founding={SOLD_OUT} annualEnabled />)).toContain("lg:grid-cols-3");
  });
});

describe("annual entry points follow the flag", () => {
  const cases: Array<[string, (annualEnabled: boolean) => ReactElement]> = [
    ["deal Pro card (free, founding full)", (a) => <DealProCard mode="free" founding={SOLD_OUT} alertsHref="/app/alerts" annualEnabled={a} />],
    ["deal Pro card (anonymous, not offered)", (a) => <DealProCard mode="anonymous" founding={NOT_OFFERED} alertsHref="/signup" annualEnabled={a} />],
    ["unlock actions (free, sold out)", (a) => <FoundingUnlockActions mode="free" founding={SOLD_OUT} annualEnabled={a} />],
    ["unlock actions (anonymous, sold out)", (a) => <FoundingUnlockActions mode="anonymous" founding={SOLD_OUT} annualEnabled={a} />],
    ["unlock panel (sold out)", (a) => <UnlockPanel mode="free" founding={SOLD_OUT} annualEnabled={a} />],
    ["founding-full notice (signed in)", (a) => <FoundingFullNotice signedIn loginHref="/login" annualEnabled={a} />],
    ["founding-full notice (signed out)", (a) => <FoundingFullNotice signedIn={false} loginHref="/login" annualEnabled={a} />],
    ["founding-full notice (not eligible)", (a) => <FoundingFullNotice signedIn notEligible loginHref="/login" annualEnabled={a} />],
    ["/checkout founding-full fallback", (a) => <FoundingFullCheckout annualEnabled={a} />],
    [
      "deal page detail (founding full)",
      (a) => (
        <DealPreviewDetail
          deal={DEAL_PREVIEW_DETAIL_FIXTURE}
          unlock={{ mode: "free", founding: SOLD_OUT, annualEnabled: a }}
        />
      ),
    ],
  ];

  it.each(cases)("%s: off hides annual, monthly stays", (_label, ui) => {
    const out = html(ui(false));
    expect(out).not.toMatch(ANNUAL_MARKERS);
    expect(out).toMatch(/£39/);
  });

  it.each(cases)("%s: on shows annual", (_label, ui) => {
    expect(html(ui(true))).toMatch(/Pro annual|Continue with annual|£29\.17/);
  });

  it("deal page detail hides annual when the flag is omitted", () => {
    const out = html(<DealPreviewDetail deal={DEAL_PREVIEW_DETAIL_FIXTURE} unlock={{ mode: "free", founding: SOLD_OUT }} />);
    expect(out).not.toMatch(ANNUAL_MARKERS);
  });
});

describe("founding race fallback", () => {
  function fullResponse() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ code: "FOUNDING_CAP_FULL" }), { status: 409 })),
    );
  }

  it("off: offers Pro monthly, never annual", async () => {
    fullResponse();
    const { container } = render(<FoundingCheckoutButton label="Become a founding member" returnTo="/pricing" annualEnabled={false} />);
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").innerHTML).not.toMatch(ANNUAL_MARKERS);
    expect(container.querySelector("input[name='planKey']")?.getAttribute("value")).toBe("PRO_MONTHLY");
  });

  it("on: offers Pro annual", async () => {
    fullResponse();
    const { container } = render(<FoundingCheckoutButton label="Become a founding member" returnTo="/pricing" annualEnabled />);
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(container.querySelector("input[name='planKey']")?.getAttribute("value")).toBe("PRO_ANNUAL");
  });
});

describe("/app/billing reads the server flag", () => {
  it("off: monthly only", async () => {
    mocks.env = { ...OFF };
    const out = html(await BillingPage({ searchParams: Promise.resolve({}) }));
    expect(out).not.toMatch(ANNUAL_MARKERS);
    expect(out).toContain("Subscribe monthly");
  });

  it("on: monthly and annual", async () => {
    mocks.env = { ...ON };
    const out = html(await BillingPage({ searchParams: Promise.resolve({}) }));
    expect(out).toContain("Subscribe annually");
    expect(out).toContain("Subscribe monthly");
    expect(out).not.toContain(ANNUAL_ID);
  });
});

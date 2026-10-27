import fs from "node:fs";
import path from "node:path";

import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FoundingCheckoutSummary } from "@/components/billing/founding-checkout-summary";
import { FoundingUnlockActions } from "@/components/billing/founding-unlock-actions";
import { PricingPlans } from "@/components/billing/pricing-plans";
import { DealProCard } from "@/components/deals/deal-pro-card";
import { UnlockPanel } from "@/components/deals/unlock-panel";
import { HomeFoundingCta } from "@/components/marketing/home-founding-cta";

const mocks = vi.hoisted(() => ({
  readFoundingAvailability: vi.fn(async () => ({ available: true })),
  getAuthUser: vi.fn(async () => null),
  getHomeSearchChips: vi.fn(async () => []),
  searchLiveHomePreviews: vi.fn(async () => ({ items: [], total: 0 })),
  createSupabaseServerClient: vi.fn(async () => ({})),
  getAppOrigin: vi.fn(() => "https://example.test"),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/founding-public", () => ({
  readFoundingAvailability: mocks.readFoundingAvailability,
}));
vi.mock("@/lib/auth/session", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/auth/urls", () => ({ getAppOrigin: mocks.getAppOrigin }));
vi.mock("@/lib/search/home-chips-server", () => ({
  getHomeSearchChips: mocks.getHomeSearchChips,
}));
vi.mock("@/lib/search/public", () => ({
  searchLiveHomePreviews: mocks.searchLiveHomePreviews,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/pricing",
}));

const ROOT = process.cwd();

function htmlLeaks(html: string): void {
  expect(html).not.toMatch(/remaining/i);
  expect(html).not.toContain('"cap"');
  expect(html).not.toMatch(/\d+\s*places?\s+left/i);
  expect(html).not.toMatch(/of\s*25/);
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("founding UI only receives availability", () => {
  it("renders every founding surface without a count, cap or places-left copy", () => {
    const surfaces = [
      <PricingPlans key="pricing" signedIn founding={{ available: true }} />,
      <HomeFoundingCta key="home" signedIn available />,
      <DealProCard
        key="deal"
        mode="free"
        founding={{ available: true }}
        alertsHref="/app/alerts"
      />,
      <UnlockPanel key="unlock" mode="free" founding={{ available: true }} />,
      <FoundingUnlockActions
        key="actions"
        state="available"
        mode="anonymous"
      />,
      <FoundingCheckoutSummary key="summary" available />,
    ];

    for (const surface of surfaces) {
      htmlLeaks(renderToString(surface));
    }
  });

  it("hides founding CTAs when availability is false", () => {
    expect(renderToString(<HomeFoundingCta signedIn available={false} />)).toBe("");
    expect(renderToString(<FoundingCheckoutSummary available={false} />)).toBe("");
    expect(
      renderToString(
        <DealProCard
          mode="free"
          founding={{ available: false }}
          alertsHref="/app/alerts"
        />,
      ),
    ).not.toMatch(/founding member/i);
  });

  it("renders the marketing pricing and home server pages without leaking numbers", async () => {
    const { default: PricingPage } = await import(
      "@/app/(marketing)/pricing/page"
    );
    const { default: HomePage } = await import("@/app/(marketing)/page");

    const pricing = renderToString(await PricingPage());
    htmlLeaks(pricing);
    expect(pricing).toMatch(/founding member/i);

    const home = renderToString(await HomePage());
    htmlLeaks(home);
    expect(home).toMatch(/founding member/i);
  });
});

describe("founding prop types", () => {
  it("accept availability only, never counts or caps", () => {
    type PricingProps = Parameters<typeof PricingPlans>[0];
    type HomeProps = Parameters<typeof HomeFoundingCta>[0];
    type DealProps = Parameters<typeof DealProCard>[0];
    type UnlockProps = Parameters<typeof UnlockPanel>[0];
    type ActionsProps = Parameters<typeof FoundingUnlockActions>[0];
    type SummaryProps = Parameters<typeof FoundingCheckoutSummary>[0];

    const pricing: PricingProps = { signedIn: true, founding: { available: true } };
    const home: HomeProps = { signedIn: true, available: true };
    const deal: DealProps = {
      mode: "free",
      founding: { available: true },
      alertsHref: "/app/alerts",
    };
    const unlock: UnlockProps = { mode: "free", founding: { available: true } };
    const actions: ActionsProps = { state: "available", mode: "anonymous" };
    const summary: SummaryProps = { available: true };

    // @ts-expect-error counts are not part of the founding UI props
    const badPricing: PricingProps = { signedIn: true, count: { remaining: 1, cap: 25 } };
    // @ts-expect-error the home CTA takes a boolean, not a count
    const badHome: HomeProps = { signedIn: true, remaining: 1 };
    const badDeal: DealProps = {
      mode: "free",
      // @ts-expect-error founding availability cannot carry a count
      founding: { available: true, remaining: 1 },
      alertsHref: "/app/alerts",
    };
    const badUnlock: UnlockProps = {
      mode: "free",
      // @ts-expect-error founding availability cannot carry a cap
      founding: { available: true, cap: 25 },
    };
    // @ts-expect-error the unlock actions take no count
    const badActions: ActionsProps = { state: "available", mode: "anonymous", remaining: 1 };
    // @ts-expect-error the checkout summary takes availability, not a count
    const badSummary: SummaryProps = { remaining: 1 };

    void [pricing, home, deal, unlock, actions, summary];
    void [badPricing, badHome, badDeal, badUnlock, badActions, badSummary];
  });
});

describe("founding source has no count plumbing", () => {
  it("keeps count identifiers out of components and public/app pages", () => {
    const roots = [
      path.join(ROOT, "components"),
      path.join(ROOT, "app", "(marketing)"),
      path.join(ROOT, "app", "(app)"),
    ];

    const offenders = roots.flatMap(sourceFiles).flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      const relative = path.relative(ROOT, file);
      const problems: string[] = [];
      if (/\bremaining\b/.test(source)) problems.push("remaining");
      if (/\breadFoundingRemaining\b|\bFoundingPublicCount\b/.test(source)) {
        problems.push("founding count helper");
      }
      if (/FOUNDING_CAP(?!_FULL)/.test(source)) problems.push("FOUNDING_CAP");
      return problems.map((problem) => `${relative}: ${problem}`);
    });

    expect(offenders).toEqual([]);
  });
});

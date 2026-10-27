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
  readFoundingPublicCount: vi.fn(async () => ({ offered: true, sold_out: false })),
  getAuthUser: vi.fn(async () => null),
  getHomeSearchChips: vi.fn(async () => []),
  searchLiveHomePreviews: vi.fn(async () => ({ items: [], total: 0 })),
  createSupabaseServerClient: vi.fn(async () => ({})),
  getAppOrigin: vi.fn(() => "https://example.test"),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/founding-public", () => ({
  readFoundingPublicCount: mocks.readFoundingPublicCount,
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

const openCount = { offered: true, sold_out: false };
const soldOutCount = { offered: true, sold_out: true };
const notOfferedCount = { offered: false, sold_out: true };

function htmlLeaks(html: string): void {
  expect(html).not.toMatch(/\bremaining\b/i);
  expect(html).not.toMatch(/(?<![-\w])cap(?![-\w])/i);
  expect(html).not.toMatch(/\bcount\b/i);
  expect(html).not.toContain('"cap"');
  expect(html).not.toMatch(/\d+\s*places?\s+left/i);
  expect(html).not.toMatch(/of\s*25/);
  expect(html).not.toContain("Founding places available");
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("founding UI only receives the public count shape", () => {
  it("renders every founding surface without a count, cap or places-left copy", () => {
    const surfaces = [
      <PricingPlans key="pricing" signedIn founding={openCount} />,
      <HomeFoundingCta key="home" signedIn founding={openCount} />,
      <DealProCard
        key="deal"
        mode="free"
        founding={openCount}
       
      />,
      <UnlockPanel key="unlock" mode="free" founding={openCount} />,
      <FoundingUnlockActions
        key="actions"
        founding={openCount}
        mode="anonymous"
      />,
      <FoundingCheckoutSummary key="summary" founding={openCount} />,
    ];

    for (const surface of surfaces) {
      const html = renderToString(surface);
      htmlLeaks(html);
      expect(html).toContain("Limited places");
    }
  });

  it("hides founding CTAs when the offer is missing, not offered or sold out", () => {
    expect(
      renderToString(<HomeFoundingCta signedIn founding={notOfferedCount} />),
    ).toBe("");
    expect(
      renderToString(<FoundingCheckoutSummary founding={notOfferedCount} />),
    ).toBe("");
    expect(renderToString(<HomeFoundingCta signedIn />)).toBe("");
    expect(renderToString(<FoundingCheckoutSummary />)).toBe("");

    for (const founding of [soldOutCount, notOfferedCount, undefined]) {
      expect(
        renderToString(
          <DealProCard
            mode="free"
            founding={founding}
           
          />,
        ),
      ).not.toMatch(/founding member/i);
    }
  });

  it("renders the marketing pricing and home server pages without leaking numbers", async () => {
    const { default: PricingPage } = await import(
      "@/app/(marketing)/pricing/page"
    );
    const { default: HomePage } = await import("@/app/(marketing)/page");

    const pricing = renderToString(await PricingPage());
    htmlLeaks(pricing);
    expect(pricing).toMatch(/founding member/i);
    expect(pricing).toContain("Limited places");

    const home = renderToString(await HomePage());
    htmlLeaks(home);
    expect(home).toMatch(/founding member/i);
    expect(home).toContain("Limited places");
  });
});

describe("founding prop types", () => {
  it("accepts the public count shape only, never remaining, cap or available", () => {
    type PricingProps = Parameters<typeof PricingPlans>[0];
    type HomeProps = Parameters<typeof HomeFoundingCta>[0];
    type DealProps = Parameters<typeof DealProCard>[0];
    type UnlockProps = Parameters<typeof UnlockPanel>[0];
    type ActionsProps = Parameters<typeof FoundingUnlockActions>[0];
    type SummaryProps = Parameters<typeof FoundingCheckoutSummary>[0];

    const pricing: PricingProps = { signedIn: true, founding: openCount };
    const home: HomeProps = { signedIn: true, founding: openCount };
    const deal: DealProps = {
      mode: "free",
      founding: openCount,
    };
    const unlock: UnlockProps = { mode: "free", founding: openCount };
    const actions: ActionsProps = { founding: openCount, mode: "anonymous" };
    const summary: SummaryProps = { founding: openCount };

    const badPricingRemaining: PricingProps = {
      signedIn: true,
      // @ts-expect-error remaining is not part of the public founding count
      founding: { offered: true, sold_out: false, remaining: 1 },
    };
    const badPricingCap: PricingProps = {
      signedIn: true,
      // @ts-expect-error cap is not part of the public founding count
      founding: { offered: true, sold_out: false, cap: 25 },
    };
    const badPricingAvailable: PricingProps = {
      signedIn: true,
      // @ts-expect-error availability is not part of the public founding count
      founding: { offered: true, sold_out: false, available: true },
    };
    // @ts-expect-error the home CTA takes a count object, not a bare remaining count
    const badHome: HomeProps = { signedIn: true, remaining: 1 };
    // @ts-expect-error the home CTA does not take availability
    const badHomeAvailable: HomeProps = { signedIn: true, available: true };
    const badDeal: DealProps = {
      mode: "free",
      // @ts-expect-error founding cannot carry a remaining count
      founding: { offered: true, sold_out: false, remaining: 1 },
    };
    const badUnlock: UnlockProps = {
      mode: "free",
      // @ts-expect-error founding cannot carry a cap
      founding: { offered: true, sold_out: false, cap: 25 },
    };
    const badUnlockAvailable: UnlockProps = {
      mode: "free",
      // @ts-expect-error founding cannot carry availability
      founding: { offered: true, sold_out: false, available: true },
    };
    // @ts-expect-error the unlock actions take no remaining count
    const badActions: ActionsProps = { founding: openCount, mode: "anonymous", remaining: 1 };
    // @ts-expect-error the unlock actions do not take availability
    const badActionsAvailable: ActionsProps = { founding: openCount, mode: "anonymous", available: true };
    // @ts-expect-error the checkout summary takes a count object, not a remaining count
    const badSummary: SummaryProps = { remaining: 1 };
    // @ts-expect-error the checkout summary does not take availability
    const badSummaryAvailable: SummaryProps = { available: true };

    void [pricing, home, deal, unlock, actions, summary];
    void [
      badPricingRemaining,
      badPricingCap,
      badPricingAvailable,
      badHome,
      badHomeAvailable,
      badDeal,
      badUnlock,
      badUnlockAvailable,
      badActions,
      badActionsAvailable,
      badSummary,
      badSummaryAvailable,
    ];
  });
});

describe("founding source has no count plumbing", () => {
  it("keeps count identifiers and old labels out of components and public/app pages", () => {
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
      if (/\breadFoundingRemaining\b/.test(source)) {
        problems.push("founding count helper");
      }
      if (/FOUNDING_CAP(?!_FULL)/.test(source)) problems.push("FOUNDING_CAP");
      if (source.includes("Founding places available")) {
        problems.push("Founding places available");
      }
      return problems.map((problem) => `${relative}: ${problem}`);
    });

    expect(offenders).toEqual([]);
  });
});

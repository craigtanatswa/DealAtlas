import fs from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readFoundingPublicCount: vi.fn(async () => ({ offered: true, sold_out: false })),
  getAuthUser: vi.fn(async (): Promise<{ id: string } | null> => null),
  getHomeSearchChips: vi.fn(async () => [] as unknown[]),
  searchLiveHomePreviews: vi.fn(async () => ({ items: [], total: 0 })),
  createSupabaseServerClient: vi.fn(async () => ({})),
  getAppOrigin: vi.fn(() => "https://www.dealatlas.uk"),
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

import { BillingSummary } from "@/components/billing/billing-summary";
import {
  FoundingCheckoutSummary,
  FoundingFullCheckout,
} from "@/components/billing/founding-checkout-summary";
import { FoundingFullNotice } from "@/components/billing/founding-full-notice";
import { FoundingUnlockActions } from "@/components/billing/founding-unlock-actions";
import { DealProCard } from "@/components/deals/deal-pro-card";
import { UnlockPanel } from "@/components/deals/unlock-panel";
import { GuideMarkdown } from "@/components/guides/guide-markdown";
import {
  FOUNDING_PLAN_KEY,
  foundingCheckoutPath,
  foundingSignupPath,
  LIFETIME_PLAN_QUERY,
} from "@/lib/billing/founding-ui";
import {
  LIFETIME_PLAN_LINE,
  PLAN_PUBLIC_NAME,
  SHOW_LIMITED_PLACES,
} from "@/lib/billing/lifetime-copy";
import { isLifetimeTerm } from "@/lib/billing/lifetime-term";
import type { EntitlementSnapshot } from "@/lib/entitlements/types";
import {
  GUIDES_DIR,
  getPublishedGuide,
  listPublishedGuides,
  publishedGuidePaths,
} from "@/lib/guides/content";
import { guideJsonLd } from "@/lib/guides/json-ld";

const ORIGIN = "https://www.dealatlas.uk";
const available = { offered: true, sold_out: false };
const soldOut = { offered: true, sold_out: true };

const GUIDE_FAQ_SLUGS = [
  "it-tenders-uk",
  "financial-services-tenders-uk",
  "transport-logistics-tenders-uk",
] as const;

function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function planKeyValues(html: string): Array<string | undefined> {
  return Array.from(html.matchAll(/<input[^>]*name="planKey"[^>]*>/g)).map(
    (match) => /value="([^"]*)"/.exec(match[0])?.[1],
  );
}

function foundingFormPlanKeys(html: string): string[] {
  const forms = html.match(/<form\b[\s\S]*?<\/form>/g) ?? [];
  return forms
    .filter((form) => /data-analytics-plan="founding"/.test(form))
    .map((form) => /name="planKey"[^>]*value="([^"]*)"/.exec(form)?.[1] ?? "");
}

function hrefsAndActions(html: string): string[] {
  return Array.from(html.matchAll(/\b(?:href|action)="([^"]*)"/g)).map((match) => {
    const decodedAmp = (match[1] ?? "").replace(/&amp;/g, "&");
    try {
      return decodeURIComponent(decodedAmp);
    } catch {
      return decodedAmp;
    }
  });
}

async function renderPricing(
  founding: { offered: boolean; sold_out: boolean },
  signedIn = false,
): Promise<string> {
  mocks.readFoundingPublicCount.mockResolvedValue(founding);
  mocks.getAuthUser.mockResolvedValue(signedIn ? { id: "user-1" } : null);
  const { default: PricingPage } = await import("@/app/(marketing)/pricing/page");
  return renderToStaticMarkup(await PricingPage());
}

async function renderHome(
  founding: { offered: boolean; sold_out: boolean },
  signedIn = false,
): Promise<string> {
  mocks.readFoundingPublicCount.mockResolvedValue(founding);
  mocks.getAuthUser.mockResolvedValue(signedIn ? { id: "user-1" } : null);
  const { default: HomePage } = await import("@/app/(marketing)/page");
  return renderToStaticMarkup(await HomePage());
}

beforeEach(() => {
  mocks.readFoundingPublicCount.mockResolvedValue(available);
  mocks.getAuthUser.mockResolvedValue(null);
  mocks.getHomeSearchChips.mockResolvedValue([]);
  mocks.searchLiveHomePreviews.mockResolvedValue({ items: [], total: 0 });
  mocks.createSupabaseServerClient.mockResolvedValue({});
  mocks.getAppOrigin.mockReturnValue(ORIGIN);
});

describe("Lifetime public copy constants", () => {
  it("uses the exact plan line, public name and a count-free limited-places line", () => {
    expect(LIFETIME_PLAN_LINE).toBe("Lifetime deal: £250 one-time (VAT included). Limited places.");
    expect(PLAN_PUBLIC_NAME).toBe("Lifetime deal");
    expect(SHOW_LIMITED_PLACES).toBe(true);
  });
});

describe("Lifetime marketing pages", () => {
  it("renders available Lifetime copy on pricing and home without old founding pricing", async () => {
    for (const html of [await renderPricing(available, true), await renderHome(available, true)]) {
      expect(html).toContain(LIFETIME_PLAN_LINE);
      expect(html).toMatch(/<s[^>]*>£350\/yr<\/s>/);
      expect(html).toContain("£250 once");
      expect(visibleText(html)).not.toMatch(/founding/i);
      expect((html.match(/Limited places/g) ?? []).length).toBe(1);
      expect(html).not.toMatch(/\d+\s*places?/i);
      expect(html).not.toMatch(/\d+\s*places?\s*(left|remaining)/i);
      expect(html).not.toContain("£290");
      expect(html).not.toContain("£24.17");
      expect(html).not.toContain("stay subscribed");

      const foundingForms = foundingFormPlanKeys(html);
      expect(foundingForms.length).toBeGreaterThan(0);
      expect(foundingForms.every((value) => value === "founding_lifetime")).toBe(true);
      expect(planKeyValues(html)).not.toContain("FOUNDING");
    }
  });

  it("hides the Lifetime offer on pricing and home when sold out", async () => {
    const pricing = await renderPricing(soldOut);
    const home = await renderHome(soldOut);

    for (const html of [pricing, home]) {
      expect(html).not.toContain("Get the Lifetime deal");
      expect(html).not.toContain(LIFETIME_PLAN_LINE);
      expect(html).not.toContain("Limited places");
      expect(html).not.toMatch(/founding/i);
    }
    expect(pricing).toContain("The Lifetime deal is sold out.");
  });
});

describe("Lifetime public components", () => {
  it("never shows founding or old annual pricing on any Lifetime surface", () => {
    const surfaces = [
      <DealProCard key="free" mode="free" founding={available} alertsHref="/app/alerts" />,
      <DealProCard key="anon" mode="anonymous" founding={available} alertsHref="/signup" />,
      <FoundingUnlockActions key="actions" founding={available} mode="anonymous" />,
      <FoundingCheckoutSummary key="summary" founding={available} />,
      <FoundingFullNotice key="full" signedIn loginHref="/login" />,
      <FoundingFullCheckout key="full-checkout" />,
      <UnlockPanel key="unlock" mode="free" founding={available} />,
    ];

    for (const surface of surfaces) {
      const html = renderToStaticMarkup(surface);
      expect(visibleText(html)).not.toMatch(/founding/i);
      expect(html).not.toContain("£290");
      expect(html).not.toContain("£24.17");
      expect(html).not.toContain("stay subscribed");
      if (html.includes("Get the Lifetime deal") || html.includes("Continue to payment")) {
        expect(html).toContain("Limited places");
      } else {
        expect(html).not.toContain("Limited places");
      }
    }
  });
});

describe("Lifetime public URLs", () => {
  it("never renders founding in an href or form action", async () => {
    const pricingSignedIn = await renderPricing(available, true);
    const pricingSignedOut = await renderPricing(available, false);
    const homeSignedIn = await renderHome(available, true);
    const homeSignedOut = await renderHome(available, false);

    const dealFree = renderToStaticMarkup(
      <DealProCard mode="free" founding={available} alertsHref="/app/alerts" />,
    );
    const dealAnonymous = renderToStaticMarkup(
      <DealProCard mode="anonymous" founding={available} alertsHref="/signup" />,
    );
    const actionsAnonymous = renderToStaticMarkup(
      <FoundingUnlockActions founding={available} mode="anonymous" />,
    );
    const actionsFree = renderToStaticMarkup(
      <FoundingUnlockActions founding={available} mode="free" />,
    );
    const unlockFree = renderToStaticMarkup(
      <UnlockPanel mode="free" founding={available} />,
    );
    const unlockAnonymous = renderToStaticMarkup(
      <UnlockPanel mode="anonymous" founding={available} />,
    );
    const summary = renderToStaticMarkup(
      <FoundingCheckoutSummary founding={available} />,
    );
    const fullNoticeSignedIn = renderToStaticMarkup(
      <FoundingFullNotice signedIn loginHref="/login" />,
    );
    const fullNoticeSignedOut = renderToStaticMarkup(
      <FoundingFullNotice signedIn={false} loginHref="/login" />,
    );
    const fullCheckout = renderToStaticMarkup(<FoundingFullCheckout />);

    const surfaces = [
      pricingSignedIn,
      pricingSignedOut,
      homeSignedIn,
      homeSignedOut,
      dealFree,
      dealAnonymous,
      actionsAnonymous,
      actionsFree,
      unlockFree,
      unlockAnonymous,
      summary,
      fullNoticeSignedIn,
      fullNoticeSignedOut,
      fullCheckout,
    ];

    for (const html of surfaces) {
      expect(hrefsAndActions(html).filter((url) => /founding/i.test(url))).toEqual([]);
    }

    const signedOutUrls = [
      pricingSignedOut,
      homeSignedOut,
      dealAnonymous,
      actionsAnonymous,
      unlockAnonymous,
      fullNoticeSignedOut,
    ].flatMap(hrefsAndActions);
    expect(signedOutUrls.some((url) => url.includes("/checkout?plan=lifetime"))).toBe(true);
  });

  it("keeps the public Lifetime URLs and constants stable", () => {
    expect(foundingCheckoutPath()).toBe("/checkout?plan=lifetime");

    const signup = decodeURIComponent(foundingSignupPath());
    expect(signup).toContain("/checkout?plan=lifetime");
    expect(signup).not.toMatch(/founding/i);
    expect(foundingSignupPath()).not.toMatch(/founding/i);

    expect(LIFETIME_PLAN_QUERY).toBe("lifetime");
    expect(FOUNDING_PLAN_KEY).toBe("founding_lifetime");
  });
});

describe("Lifetime guide copy", () => {
  it("never shows founding or old pricing in any published guide", () => {
    for (const guide of listPublishedGuides()) {
      const html = renderToStaticMarkup(
        <GuideMarkdown blocks={guide.blocks} publishedGuidePaths={publishedGuidePaths()} />,
      );
      const jsonLd = JSON.stringify(guideJsonLd(ORIGIN, guide));
      for (const output of [html, jsonLd, guide.title, guide.description]) {
        expect(output).not.toMatch(/founding/i);
        expect(output).not.toContain("£290");
        expect(output).not.toContain("£24.17");
        expect(output).not.toContain("24.17");
        expect(output).not.toContain("stay subscribed");
        expect(output).not.toMatch(/\d+\s*places?/i);
        expect(output).not.toContain("{{LIFETIME_PLAN_LINE}}");
        expect(output).not.toContain("utm_campaign=founding");
      }
    }
  });

  it("shows the exact plan line in every published guide", () => {
    for (const guide of listPublishedGuides()) {
      const html = renderToStaticMarkup(
        <GuideMarkdown blocks={guide.blocks} publishedGuidePaths={publishedGuidePaths()} />,
      );
      expect(html).toContain(LIFETIME_PLAN_LINE);
    }
  });

  it("puts the plan line in the FAQPage JSON-LD answers for the tender guides", () => {
    for (const slug of GUIDE_FAQ_SLUGS) {
      const guide = getPublishedGuide(slug)!;
      const jsonLd = guideJsonLd(ORIGIN, guide) as {
        "@graph": Array<Record<string, unknown>>;
      };
      const faqPage = jsonLd["@graph"].find((node) => node["@type"] === "FAQPage");
      expect(faqPage).toBeTruthy();
      const answers = (faqPage!.mainEntity as Array<{
        acceptedAnswer: { text: string };
      }>).map((item) => item.acceptedAnswer.text);
      expect(answers.some((answer) => answer.includes(LIFETIME_PLAN_LINE))).toBe(true);
    }
  });
});

describe("Lifetime billing view", () => {
  const lifetimeEntitlement = {
    plan: "PRO",
    status: "ACTIVE",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    billingInterval: null,
    planKey: null,
    term: "lifetime",
  } as unknown as EntitlementSnapshot;

  const annualEntitlement: EntitlementSnapshot = {
    plan: "PRO",
    status: "ACTIVE",
    currentPeriodEnd: "2027-01-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    billingInterval: "ANNUAL",
    planKey: "PRO_ANNUAL",
    term: "annual",
  };

  it("shows a lifetime member as Lifetime with a one-time payment and receipts", () => {
    const html = renderToStaticMarkup(
      <BillingSummary entitlement={lifetimeEntitlement} hasCustomerPortal />,
    );
    expect(isLifetimeTerm(lifetimeEntitlement)).toBe(true);
    expect(html.match(/Lifetime deal/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(html).toContain("The Lifetime deal is a one-time payment. There is nothing to renew or cancel.");
    expect(html).toContain("One-time payment");
    expect(html).toContain("View receipts");
    expect(html).not.toContain("Renewal / period end");
    expect(html).not.toContain("Billing interval");
    expect(html).not.toContain("Manage billing");
    expect(html).not.toContain("Pro access continues until");
    expect(html).not.toContain("Not scheduled");
    expect(html).not.toMatch(/founding|£290/i);
  });

  it("keeps the normal renewal view for a regular Pro annual member", () => {
    const html = renderToStaticMarkup(
      <BillingSummary entitlement={annualEntitlement} hasCustomerPortal />,
    );
    expect(isLifetimeTerm(annualEntitlement)).toBe(false);
    expect(html).toContain("Pro annual");
    expect(html).toContain("Billing interval");
    expect(html).toContain("Renewal / period end");
    expect(html).toContain("Manage billing");
    expect(html).not.toContain("One-time payment");
    expect(html).not.toContain("View receipts");
  });
});

describe("Lifetime guide sources", () => {
  it("contains no Founding, £290 or £24.17 text in content/guides", () => {
    const files = fs.readdirSync(GUIDES_DIR).filter((file) => file.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = fs.readFileSync(path.join(GUIDES_DIR, file), "utf8");
      expect(source).not.toMatch(/founding/i);
      expect(source).not.toContain("£290");
      expect(source).not.toContain("£24.17");
    }
  });
});

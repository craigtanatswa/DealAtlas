// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { HomeOpportunitySections } from "@/components/marketing/home-sections";
import { RecentAwardStripView } from "@/components/marketing/recent-award-strip";
import { DEAL_PREVIEW_DETAIL_FIXTURE } from "@/components/deals/fixtures";
import {
  RECENT_AWARD_AGGREGATE_KEYS,
  RECENT_AWARD_CARD_KEYS,
  parseRecentAwardStrip,
  recentAwardAggregateLine,
  recentAwardUpgradeHref,
} from "@/lib/awards/recent";
import { BROAD_REGIONS } from "@/lib/preview/region";
import { staticSitemapEntries } from "@/lib/seo/sitemap";

afterEach(cleanup);

const ROOT = path.resolve(__dirname, "../..");

const SEEDED = {
  buyer: "CANARY BUYER NEVER FREE",
  winner: "CANARY WINNER NEVER FREE",
  title: "CANARY SOURCE TITLE NEVER FREE",
  reference: "ZQ-AWD-2026-0417",
  id: "5eed0000-0000-4000-8000-0000000000b2",
  awardedOn: "2026-10-01",
  exactValue: "123456.78",
} as const;

function poisonedRow(
  sector: string,
  region: string,
  valueBand: string,
  recencyWeeks: 2 | 4 | 8,
  extras: Record<string, unknown> = {},
) {
  return {
    sector,
    region,
    value_band: valueBand,
    recency_weeks: recencyWeeks,
    aggregate_value_label: "£4.2m",
    aggregate_contract_count: 37,
    aggregate_window_weeks: 8,
    buyer: SEEDED.buyer,
    winner: SEEDED.winner,
    source_title: SEEDED.title,
    award_identifier: SEEDED.reference,
    id: SEEDED.id,
    award_date: SEEDED.awardedOn,
    award_value: SEEDED.exactValue,
    slug: "canary-award-notice",
    ...extras,
  };
}

const POISONED_ROWS = [
  poisonedRow("Healthcare", "London", "£100k–£250k", 2),
  poisonedRow("Public", "North West England", "£50k–£100k", 4),
  poisonedRow("Utility", "Wales", "£1m–£5m", 8),
  poisonedRow("Healthcare", "London", "£1m–£5m", 2),
  poisonedRow("Education", "Harl Lane", "£100k–£250k", 2),
];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".next") {
      return [];
    }
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

describe("recent award card shape", () => {
  it("keeps only the allowlisted card and aggregate keys", () => {
    const strip = parseRecentAwardStrip(POISONED_ROWS);

    expect(strip).not.toBeNull();
    expect(strip?.cards).toHaveLength(3);
    expect(strip?.cards.map((card) => Object.keys(card))).toEqual([
      [...RECENT_AWARD_CARD_KEYS],
      [...RECENT_AWARD_CARD_KEYS],
      [...RECENT_AWARD_CARD_KEYS],
    ]);
    expect(strip?.cards[0]).toEqual({
      sector: "Healthcare",
      region: "London",
      valueBand: "£100k–£250k",
      recencyWeeks: 2,
    });
    expect(Object.keys(strip?.aggregate ?? {})).toEqual([...RECENT_AWARD_AGGREGATE_KEYS]);
    expect(strip?.aggregate).toEqual({
      valueLabel: "£4.2m",
      contractCount: 35,
      windowWeeks: 8,
    });
    expect(recentAwardAggregateLine(strip!.aggregate!)).toBe(
      "£4.2m awarded across 35 contracts in the last 8 weeks",
    );
  });

  it("hides the strip below three cards and the aggregate below ten awards", () => {
    expect(parseRecentAwardStrip(POISONED_ROWS.slice(0, 2))).toBeNull();
    const hiddenAggregate = parseRecentAwardStrip(
      POISONED_ROWS.slice(0, 3).map((row) => ({
        ...row,
        aggregate_contract_count: 9,
      })),
    );
    expect(hiddenAggregate?.cards).toHaveLength(3);
    expect(hiddenAggregate?.aggregate).toBeNull();
  });

  it("drops an exact value label instead of sending it through", () => {
    const strip = parseRecentAwardStrip(
      POISONED_ROWS.slice(0, 3).map((row) => ({
        ...row,
        aggregate_value_label: "£1234567",
      })),
    );
    expect(strip?.aggregate).toBeNull();
  });
});

describe("recent award homepage HTML and RSC", () => {
  it("contains no buyer, winner or title strings for seeded awards", () => {
    const strip = parseRecentAwardStrip(POISONED_ROWS);
    const html = renderToStaticMarkup(
      <>
        <HomeOpportunitySections
          latest={{
            items: [{ preview: DEAL_PREVIEW_DETAIL_FIXTURE, match: null }],
            total: 1,
            page: 1,
            pageSize: 8,
          }}
          closingSoon={{ items: [], total: 0, page: 1, pageSize: 4 }}
        />
        <RecentAwardStripView strip={strip} nextPath="/" />
      </>,
    );
    const rsc = JSON.stringify(strip);

    for (const secret of Object.values(SEEDED)) {
      expect(html).not.toContain(secret);
      expect(rsc).not.toContain(secret);
    }
    expect(html).toContain("Recently awarded");
    expect(html).toContain("Healthcare");
    expect(html).toContain("Awarded in the last 2 weeks");
    expect(html).not.toMatch(/Awarded in the last \d+ days/);
    expect(html).toContain("£4.2m awarded across 35 contracts in the last 8 weeks");
    expect(rsc).not.toMatch(/"buyer"|"winner"|"source_title"|"award_date"|"award_value"|"slug"|"id"/);
  });

  it("renders non-linked cards and a pricing CTA without data attributes", () => {
    const strip = parseRecentAwardStrip(POISONED_ROWS);
    const view = render(<RecentAwardStripView strip={strip} nextPath="/deals" />);
    const html = view.container.innerHTML;

    expect(view.getAllByText("Healthcare").length).toBeGreaterThan(0);
    expect(html).not.toMatch(/<a[^>]*>(?:(?!<\/a>).)*Healthcare/);
    expect(view.getByRole("link").getAttribute("href")).toBe(recentAwardUpgradeHref("/deals"));
    expect(recentAwardUpgradeHref("/deals")).toBe("/pricing?plan=annual&next=%2Fdeals");
    expect(recentAwardUpgradeHref("/deals?q=CANARY%20BUYER")).toBe(
      "/pricing?plan=annual&next=%2F",
    );
    expect(html).toContain("See who won with Pro");
    expect(html).toContain("Pro: see who won and when it's up for renewal");
    expect(html).not.toMatch(/data-(id|award|slug|date)=/i);
    expect(view.container.querySelectorAll("a")).toHaveLength(1);
  });
});

describe("recent award publication boundary", () => {
  it("does not publish per-award pages, sitemap entries or social metadata", () => {
    const awardRoutes = walk(path.join(ROOT, "app")).filter((file) =>
      file.split(path.sep).includes("awards"),
    );
    expect(awardRoutes).toEqual([]);

    const urls = staticSitemapEntries("https://dealatlas.example").map((entry) => entry.url);
    expect(urls.some((url) => url.includes("/awards"))).toBe(false);

    const stripSource = fs.readFileSync(
      path.join(ROOT, "components/marketing/recent-award-strip.tsx"),
      "utf8",
    );
    expect(stripSource).toContain("key={index}");
    expect(stripSource).not.toContain("use client");
    expect(stripSource).not.toMatch(/json-ld|openGraph|serializeJsonLd/i);

    const migration = fs.readFileSync(
      path.join(ROOT, "supabase/migrations/0026_recent_award_bands.sql"),
      "utf8",
    );
    const start = migration.indexOf("-- BROAD_REGIONS");
    const end = migration.indexOf("-- END BROAD_REGIONS");
    const regions = [...migration.slice(start, end).matchAll(/'((?:[^']|'')*)'/g)].map((match) =>
      match[1].replace(/''/g, "'"),
    );
    expect(regions).toEqual([...BROAD_REGIONS]);
    expect(migration).toContain("security definer");
    expect(migration).toContain(
      "grant execute on function public.list_recent_award_bands() to anon, authenticated, service_role",
    );
    expect(migration).not.toMatch(/canonical_name|source_title|award_identifier|award_suppliers/);

    const deals = fs.readFileSync(path.join(ROOT, "app/(marketing)/deals/page.tsx"), "utf8");
    const dealsBody = deals.slice(deals.indexOf("return ("));
    expect(dealsBody.indexOf("DealSearchResults")).toBeLessThan(
      dealsBody.indexOf("RecentAwardStripView"),
    );
    expect(deals).toContain('nextPath="/deals"');
  });
});

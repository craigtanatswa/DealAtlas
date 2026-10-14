import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("homepage latest opportunities", () => {
  it("loads six published previews through the existing search RPC", () => {
    const source = fs.readFileSync(path.join(ROOT, "lib/search/public.ts"), "utf8");
    const fn = source.slice(source.indexOf("export async function searchLiveHomePreviews"));
    expect(fn).toContain("searchPublishedDealPreviews");
    expect(fn).toContain('statuses: ["CLOSING_SOON", "OPEN", "UPCOMING"]');
    expect(fn).toContain('sort: "biddable"');
    expect(fn).toContain("limit: HOME_LIVE_LIMIT");
    expect(source).toContain("export const HOME_LIVE_LIMIT = 6");
    expect(fn).not.toContain("takeHomeTeaser");
    expect(fn).not.toContain("buyer_name");
    expect(fn).not.toContain("source_url");
  });

  it("renders a single-column list and hides the section when empty", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "components/marketing/home-sections.tsx"),
      "utf8",
    );
    const start = source.indexOf("export function HomeLiveOpportunities");
    const fn = source.slice(start, source.indexOf("export function HomeTestimonialsSection"));
    expect(fn).toContain("if (items.length === 0)");
    expect(fn).toContain("return null");
    expect(fn).toContain("Latest opportunities");
    expect(fn).toContain(
      "Open and upcoming opportunities first. Join DealAtlas Pro to unlock buyer and source details.",
    );
    expect(fn).toContain("View all opportunities");
    expect(fn).toContain("DealList");
    expect(fn).toContain("proLock");
    expect(fn).toContain("signupPathWithNext");
    expect(fn).toContain("See all live deals →");
    expect(fn).not.toContain("grid-cols");
    expect(fn).not.toContain("HomeTeaser");
    const card = fs.readFileSync(path.join(ROOT, "components/deals/deal-card.tsx"), "utf8");
    expect(card).toContain("🔒 Buyer, documents and contacts with Pro");
    expect(card).not.toMatch(/blur|backdrop-filter/);
  });
});
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("homepage live opportunities", () => {
  it("loads published previews through the existing search RPC", () => {
    const source = fs.readFileSync(path.join(ROOT, "lib/search/public.ts"), "utf8");
    const fn = source.slice(source.indexOf("export async function searchLiveHomePreviews"));
    expect(fn).toContain("searchPublishedDealPreviews");
    expect(fn).toContain('statuses: ["CLOSING_SOON", "OPEN", "UPCOMING"]');
    expect(fn).toContain('sort: "biddable"');
    expect(fn).toContain("takeHomeTeaser");
    expect(fn).toContain("buyerSector");
    expect(source).toContain("export const HOME_LIVE_LIMIT = 24");
    expect(fn).not.toContain("buyer_name");
    expect(fn).not.toContain("source_url");
  });

  it("hides an empty grid and links the live count to /deals", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "components/marketing/home-sections.tsx"),
      "utf8",
    );
    const fn = source.slice(source.indexOf("export function HomeLiveOpportunities"));
    expect(fn).toContain("if (items.length === 0)");
    expect(fn).toContain("return null");
    expect(fn).toContain("DealCard");
    expect(fn).toContain("proLock");
    expect(fn).toContain("signupPathWithNext");
    expect(fn).toContain("xl:grid-cols-4");
    expect(fn).toContain('href="/deals"');
    expect(fn).toContain("See all {total} live deals");
    expect(source).toContain("Create free account");
    const card = fs.readFileSync(path.join(ROOT, "components/deals/deal-card.tsx"), "utf8");
    expect(card).toContain("Buyer, documents, contacts: Pro");
    expect(card).not.toMatch(/blur|backdrop-filter/);
  });
});
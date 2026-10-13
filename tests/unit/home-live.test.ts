import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("homepage live opportunities", () => {
  it("loads six published biddable previews through the existing search RPC", () => {
    const source = fs.readFileSync(path.join(ROOT, "lib/search/public.ts"), "utf8");
    const fn = source.slice(source.indexOf("export async function searchLiveHomePreviews"));
    expect(fn).toContain("searchPublishedDealPreviews");
    expect(fn).toContain('statuses: ["CLOSING_SOON", "OPEN"]');
    expect(fn).toContain('sort: "biddable"');
    expect(fn).toContain("HOME_LIVE_LIMIT");
    expect(source).toContain("export const HOME_LIVE_LIMIT = 6");
    expect(fn).not.toContain("buyer_name");
    expect(fn).not.toContain("source_url");
  });

  it("hides the section when there are no cards and links the biddable total to /deals", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "components/marketing/home-sections.tsx"),
      "utf8",
    );
    const fn = source.slice(source.indexOf("export function HomeLiveOpportunities"));
    expect(fn).toContain("if (items.length === 0)");
    expect(fn).toContain("return null");
    expect(fn).toContain("Live opportunities");
    expect(fn).toContain("Open and closing-soon contracts you can bid on now.");
    expect(fn).toContain("text-gray-600");
    expect(fn).toContain("DealList");
    expect(fn).toContain("lg:grid-cols-3");
    expect(fn).toContain('href="/deals"');
    expect(fn).toContain("See all {total} opportunities →");
  });
});

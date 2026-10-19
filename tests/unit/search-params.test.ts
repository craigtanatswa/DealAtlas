import { describe, expect, it } from "vitest";

import {
  clampSearchPage,
  hasActivePublicFilters,
  parsePublicSearchParams,
  parseSearchPage,
  parseSignedInSearchParams,
  publicSearchHref,
  searchHref,
} from "@/lib/search/params";

describe("public search params", () => {
  it("parses keyword, filters, and page from the query string", () => {
    const filters = parsePublicSearchParams({
      q: "  cloud support ",
      category: "Technology",
      buyerSector: "PUBLIC",
      region: "South East England",
      valueBand: "£250k–£500k",
      deadlineBand: "Within 3 weeks",
      dealType: "PUBLIC_TENDER",
      status: "OPEN",
      page: "2",
    });

    expect(filters).toMatchObject({
      query: "cloud support",
      category: "Technology",
      buyerSector: "PUBLIC",
      region: "South East England",
      valueBand: "£250k–£500k",
      deadlineBand: "Within 3 weeks",
      dealType: "PUBLIC_TENDER",
      status: "OPEN",
      page: 2,
      limit: 20,
    });
    expect(hasActivePublicFilters(filters)).toBe(true);
  });

  it("ignores invalid enum values instead of failing the request", () => {
    const filters = parsePublicSearchParams({
      q: "support",
      buyerSector: "SECRET",
      dealType: "NOT_A_TYPE",
      status: "HACKED",
      region: "Scotland",
      page: "nope",
    });

    expect(filters.query).toBe("support");
    expect(filters.buyerSector).toBeUndefined();
    expect(filters.dealType).toBeUndefined();
    expect(filters.status).toBeUndefined();
    expect(filters.region).toBe("Scotland");
    expect(filters.page).toBe(1);
  });

  it("clamps page to a positive integer without dropping other filters", () => {
    expect(parseSearchPage(undefined)).toBe(1);
    expect(parseSearchPage("0")).toBe(1);
    expect(parseSearchPage("-4")).toBe(1);
    expect(parseSearchPage("1.5")).toBe(1);
    expect(parseSearchPage("nope")).toBe(1);
    expect(parseSearchPage("3")).toBe(3);
    expect(parseSearchPage("9999")).toBe(500);

    const filters = parsePublicSearchParams({
      q: "construction",
      region: "Scotland",
      page: "0",
    });
    expect(filters.query).toBe("construction");
    expect(filters.region).toBe("Scotland");
    expect(filters.page).toBe(1);
    expect(clampSearchPage(9, 16, 10)).toBe(2);
    expect(clampSearchPage(1, 16, 10)).toBe(1);
    expect(clampSearchPage(4, 0, 10)).toBe(1);
  });

  it("builds shareable URLs without empty filters", () => {
    expect(
      publicSearchHref({
        query: "cloud",
        category: "Technology",
        page: 3,
        limit: 20,
      }),
    ).toBe("/deals?q=cloud&category=Technology&page=3");
  });

  it("parses signed-in relevance sort and minimum score", () => {
    const filters = parseSignedInSearchParams(
      {
        q: "cloud",
        sort: "relevance",
        minScore: "60",
      },
      { defaultSort: "updated" },
    );
    expect(filters.sort).toBe("relevance");
    expect(filters.minScore).toBe(60);
    expect(searchHref(filters, 1, "/app/search")).toBe(
      "/app/search?q=cloud&sort=relevance&minScore=60",
    );
  });

  it("ignores invalid relevance params", () => {
    const filters = parseSignedInSearchParams({
      sort: "secret",
      minScore: "nope",
    });
    expect(filters.sort).toBe("biddable");
    expect(filters.minScore).toBeUndefined();
  });
});

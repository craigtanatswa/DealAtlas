import { describe, expect, it } from "vitest";

import {
  hasActivePublicFilters,
  parsePublicSearchParams,
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
      page: "nope",
    });

    expect(filters.query).toBe("support");
    expect(filters.buyerSector).toBeUndefined();
    expect(filters.dealType).toBeUndefined();
    expect(filters.status).toBeUndefined();
    expect(filters.page).toBe(1);
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
    expect(filters.sort).toBe("updated");
    expect(filters.minScore).toBeUndefined();
  });
});

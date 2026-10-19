import { describe, expect, it } from "vitest";

import { cleanPath } from "@/lib/analytics/clean-path";

const UUID = "3f2b7c1e-9a4d-4c8e-8b1f-2d6e5a7c9b10";

describe("analytics cleanPath (shared client/server path cleaner)", () => {
  it.each([
    ["/", "/"],
    ["/deals", "/deals"],
    ["/deals?q=CANARY%20BUYER&region=london", "/deals"],
    ["/deals/council-it-support-a1b2c3", "/deals/[deal]"],
    ["/deals/council-it-support-a1b2c3/", "/deals/[deal]"],
    ["/deals/council-it-support-a1b2c3/anything/else?x=1#frag", "/deals/[deal]"],
    ["/deals/sitemap.xml", "/deals/sitemap.xml"],
    ["/deals/sitemap/3", "/deals/sitemap/[id]"],
    [`/app/deals/${UUID}`, "/app/deals/[deal]"],
    [`/app/deals/${UUID}/export`, "/app/deals/[deal]"],
    [`/app/buyers/${UUID}`, "/app/buyers/[buyer]"],
    [`/app/suppliers/${UUID}`, "/app/suppliers/[supplier]"],
    ["/app/saved", "/app/saved"],
    [`/app/saved/${UUID}`, "/app/saved/[id]"],
    [`/app/alerts/${UUID}`, "/app/alerts/[id]"],
    ["/app/search?q=CANARY", "/app/search"],
    ["/app/unknown-thing", "/app/[other]"],
    [`/api/deals/${UUID}`, "/api/[api]"],
    ["/api/search?q=buyer", "/api/[api]"],
    [`/admin/deals/${UUID}`, "/admin/[admin]"],
    ["/categories/technology", "/categories/technology"],
    ["/categories/not-a-category", "/categories/[category]"],
    ["/guides", "/guides"],
    ["/guides/how-to-win-council-contracts", "/guides/how-to-win-council-contracts"],
    ["/guides/how-to-find-public-sector-tenders", "/guides/how-to-find-public-sector-tenders"],
    ["/guides/council-it-support-a1b2c3", "/guides/[guide]"],
    ["/checkout/success?subscription_id=sub_1&payment_id=pay_1&email=a%40b.com", "/checkout/success"],
    ["/checkout/abc", "/checkout/[other]"],
    ["/pricing#faq", "/pricing"],
    ["/pricing/extra", "/[other]"],
    ["/some-unknown-page", "/[other]"],
    ["/e2e-published-abc123", "/[other]"],
    ["//evil.example/deals", null],
    ["https://www.dealatlas.uk/deals/x", null],
    ["deals/x", null],
  ])("%s → %s", (input, expected) => {
    expect(cleanPath(input)).toBe(expected);
  });

  it("is idempotent for every placeholder", () => {
    for (const placeholder of [
      "/deals/[deal]",
      "/app/deals/[deal]",
      "/app/buyers/[buyer]",
      "/app/suppliers/[supplier]",
      "/app/saved/[id]",
      "/api/[api]",
      "/admin/[admin]",
      "/categories/[category]",
      "/guides/[guide]",
      "/[other]",
    ]) {
      expect(cleanPath(placeholder)).toBe(placeholder);
    }
  });

  it("rejects non-strings and oversized input", () => {
    expect(cleanPath(undefined)).toBeNull();
    expect(cleanPath(42)).toBeNull();
    expect(cleanPath(`/deals/${"a".repeat(5000)}`)).toBeNull();
  });
});

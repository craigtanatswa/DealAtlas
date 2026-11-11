import { describe, expect, it } from "vitest";

import {
  buildRedirectLocation,
  categoryFallbackPath,
  isExpiredRow,
  isSafePublicSlug,
  resolveDealSlugRedirect,
  type SlugRedirectRow,
} from "@/lib/deals/slug-redirect";

const DEAL_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-06-01T12:00:00.000Z");

function row(overrides: Partial<SlugRedirectRow> = {}): SlugRedirectRow {
  return {
    slug: "energy-retrofit-programme-ab12cd34",
    dealId: DEAL_ID,
    isPublished: true,
    leakageRisk: "LOW",
    unpublishedByAdmin: false,
    mainCategory: "Energy & Utilities",
    submissionDeadline: "2026-07-01T12:00:00.000Z",
    dealStatus: "OPEN",
    ...overrides,
  };
}

describe("slug redirect resolution", () => {
  it("redirects a retired old slug to the alias target's current published slug", () => {
    expect(
      resolveDealSlugRedirect({
        requested: null,
        retired: true,
        aliasTarget: row({ slug: "current-energy-programme-deadbeef" }),
        now: NOW,
      }),
    ).toBe("/deals/current-energy-programme-deadbeef");
  });

  it("sends an expired LOW row to its category landing", () => {
    const expired = row({
      isPublished: false,
      submissionDeadline: "2026-05-01T12:00:00.000Z",
      dealStatus: "CLOSED",
    });
    expect(isExpiredRow(expired, NOW)).toBe(true);
    expect(
      resolveDealSlugRedirect({
        requested: expired,
        retired: false,
        aliasTarget: null,
        now: NOW,
      }),
    ).toBe("/categories/energy-utilities");
    expect(categoryFallbackPath("Energy & Utilities")).toBe(
      "/categories/energy-utilities",
    );
  });

  it("round-trips an expired row with an unknown category through a landing or /deals", () => {
    const fallback = categoryFallbackPath("goods");
    expect(fallback.startsWith("/categories/") || fallback === "/deals").toBe(true);
    expect(
      resolveDealSlugRedirect({
        requested: row({
          isPublished: false,
          mainCategory: "goods",
          submissionDeadline: "2026-05-01T12:00:00.000Z",
          dealStatus: null,
        }),
        retired: false,
        aliasTarget: null,
        now: NOW,
      }),
    ).toBe(fallback);
  });

  it("keeps held and future-deadline rows on their current gate result", () => {
    for (const held of [
      row({ isPublished: false, leakageRisk: "REVIEW" }),
      row({ isPublished: false, leakageRisk: "HIGH" }),
      row({ isPublished: false, unpublishedByAdmin: true }),
      row({
        isPublished: false,
        submissionDeadline: "2026-08-01T12:00:00.000Z",
        dealStatus: "OPEN",
      }),
    ]) {
      expect(isExpiredRow(held, NOW)).toBe(false);
      expect(
        resolveDealSlugRedirect({
          requested: held,
          retired: false,
          aliasTarget: null,
          now: NOW,
        }),
      ).toBeNull();
    }
  });

  it("never redirects a legacy deal-id-suffixed slug", () => {
    const legacy = row({
      slug: "road-maintenance-notice-11111111",
      isPublished: false,
      submissionDeadline: "2026-05-01T12:00:00.000Z",
      dealStatus: "CLOSED",
    });
    expect(
      resolveDealSlugRedirect({
        requested: legacy,
        retired: false,
        aliasTarget: null,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("does not redirect to an alias target whose slug is unsafe", () => {
    for (const slug of [
      "energy-retrofit-programme-12345678",
      "energy-retrofit-programme-AB12CD34",
      "energy--retrofit-programme-ab12cd34",
    ]) {
      expect(isSafePublicSlug(slug)).toBe(false);
      expect(
        resolveDealSlugRedirect({
          requested: null,
          retired: true,
          aliasTarget: row({ slug, isPublished: true }),
          now: NOW,
        }),
      ).toBeNull();
    }
  });

  it("accepts ordinary template slugs and rejects overlong ones", () => {
    expect(isSafePublicSlug("energy-retrofit-programme-ab12cd34")).toBe(true);
    expect(isSafePublicSlug(`a-${"b".repeat(80)}`)).toBe(false);
    expect(isSafePublicSlug("-leading-hyphen")).toBe(false);
  });
});

describe("redirect location building", () => {
  it("keeps only utm params and drops identifying query parameters", () => {
    const requestUrl = new URL(
      "https://www.dealatlas.uk/deals/old-slug?utm_source=linkedin&ref=x&buyer=acme&notice=ZQN-2026-004417&utm_campaign=spring",
    );
    const location = buildRedirectLocation(
      "/deals/current-slug-ab12cd34",
      requestUrl,
    );
    expect(location.origin).toBe("https://www.dealatlas.uk");
    expect(location.pathname).toBe("/deals/current-slug-ab12cd34");
    expect(location.searchParams.get("utm_source")).toBe("linkedin");
    expect(location.searchParams.get("utm_campaign")).toBe("spring");
    expect(location.searchParams.has("ref")).toBe(false);
    expect(location.searchParams.has("buyer")).toBe(false);
    expect(location.searchParams.has("notice")).toBe(false);
  });

  it("caps utm params at five and drops values over 200 characters", () => {
    const requestUrl = new URL(
      "https://www.dealatlas.uk/deals/old-slug?utm_a=1&utm_b=2&utm_c=3&utm_d=4&utm_e=5&utm_f=6&utm_g=short&utm_h=short&utm_i=short&utm_j=short&utm_k=short&utm_long=short&utm_source=long",
    );
    requestUrl.searchParams.set("utm_long", "x".repeat(201));
    const location = buildRedirectLocation("/deals/current-slug", requestUrl);
    expect(location.searchParams.get("utm_a")).toBe("1");
    expect(location.searchParams.get("utm_e")).toBe("5");
    expect(location.searchParams.has("utm_f")).toBe(false);
    expect(location.searchParams.has("utm_long")).toBe(false);
  });
});

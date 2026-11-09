import { describe, expect, it } from "vitest";

import {
  buyerAddressRegion,
  countryRegion,
  previewRegion,
} from "@/lib/preview/region";

describe("countryRegion", () => {
  it("maps two-letter country codes to country names or Europe (other)", () => {
    expect(countryRegion("SE")).toBe("Sweden");
    expect(countryRegion("DE")).toBe("Germany");
    expect(countryRegion("EL")).toBe("Europe (other)");
  });

  it("rejects codes that are not ISO alpha-2", () => {
    expect(countryRegion("SWE")).toBeNull();
    expect(countryRegion(null)).toBeNull();
  });
});

describe("buyerAddressRegion", () => {
  it("derives a UK region from the buyer postcode", () => {
    expect(
      buyerAddressRegion({
        countryCode: "GB",
        postcode: "M1 1AA",
      }),
    ).toBe("North West England");
  });

  it("keeps a NUTS1 region supplied on the buyer", () => {
    expect(
      buyerAddressRegion({
        countryCode: "GB",
        region: "North West England",
      }),
    ).toBe("North West England");
  });

  it("does not derive a UK region for a non-GB buyer", () => {
    expect(
      buyerAddressRegion({
        countryCode: "FR",
        postcode: "M1 1AA",
      }),
    ).toBeNull();
  });

  it("returns null when there is no buyer", () => {
    expect(buyerAddressRegion(null)).toBeNull();
  });
});

describe("previewRegion", () => {
  it("uses only the buyer country for TED and ignores finer location parts", () => {
    expect(
      previewRegion({
        sourceKey: "ted",
        locationParts: ["Stockholm"],
        buyer: { countryCode: "SE" },
      }),
    ).toBe("Sweden");
    expect(
      previewRegion({
        sourceKey: "ted",
        locationParts: ["Stockholm"],
        buyer: { countryCode: null },
      }),
    ).toBeNull();
  });

  it("falls back to the buyer address for Find a Tender when location is missing", () => {
    expect(
      previewRegion({
        sourceKey: "find-a-tender",
        locationParts: [null, undefined],
        buyer: { countryCode: "GB", postcode: "M1 1AA" },
      }),
    ).toBe("North West England");
  });

  it("does not fall back to the buyer address for Contracts Finder", () => {
    expect(
      previewRegion({
        sourceKey: "contracts-finder",
        locationParts: [null, undefined],
        buyer: { countryCode: "GB", postcode: "M1 1AA" },
      }),
    ).toBeNull();
  });
});

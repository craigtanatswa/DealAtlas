import { describe, expect, it } from "vitest";

import {
  broadRegionFromLocation,
  buyerAddressRegion,
  countryRegion,
  previewRegion,
  PUBLISHABLE_REGIONS,
  regionFromNutsCode,
  regionFromTedPlaces,
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

describe("regionFromNutsCode", () => {
  it("maps every UK NUTS1 area and deeper UK codes to its region", () => {
    expect(regionFromNutsCode("UKC1")).toBe("North East England");
    expect(regionFromNutsCode("UKD33")).toBe("North West England");
    expect(regionFromNutsCode("UKE")).toBe("Yorkshire and the Humber");
    expect(regionFromNutsCode("UKF")).toBe("East Midlands");
    expect(regionFromNutsCode("UKG")).toBe("West Midlands");
    expect(regionFromNutsCode("UKH")).toBe("East of England");
    expect(regionFromNutsCode("UKI4")).toBe("London");
    expect(regionFromNutsCode("UKJ")).toBe("South East England");
    expect(regionFromNutsCode("UKK")).toBe("South West England");
    expect(regionFromNutsCode("UKL")).toBe("Wales");
    expect(regionFromNutsCode("UKM")).toBe("Scotland");
    expect(regionFromNutsCode("UKN0")).toBe("Northern Ireland");
  });

  it("rejects bare or unknown UK prefixes", () => {
    expect(regionFromNutsCode("UKZ")).toBeNull();
    expect(regionFromNutsCode("UK")).toBeNull();
  });

  it("maps non-UK NUTS codes to their country", () => {
    expect(regionFromNutsCode("IE061")).toBe("Ireland");
    expect(regionFromNutsCode("DE300")).toBe("Germany");
    expect(regionFromNutsCode("EL303")).toBe("Europe (other)");
    expect(regionFromNutsCode("MT001")).toBe("Europe (other)");
    expect(regionFromNutsCode("XX123")).toBeNull();
  });

  it("normalises case and rejects malformed or missing codes", () => {
    expect(regionFromNutsCode("ie061")).toBe("Ireland");
    expect(regionFromNutsCode("IE0611")).toBeNull();
    expect(regionFromNutsCode("")).toBeNull();
    expect(regionFromNutsCode(null)).toBeNull();
  });
});

describe("regionFromTedPlaces", () => {
  it("reduces NUTS, ISO3 and country names to a country", () => {
    expect(regionFromTedPlaces(["IE061", "IRL", "IE061", "IRL"])).toBe("Ireland");
    expect(regionFromTedPlaces(["DEU"])).toBe("Germany");
    expect(regionFromTedPlaces(["Ireland"])).toBe("Ireland");
  });

  it("ignores EEA placeholders", () => {
    expect(regionFromTedPlaces(["anyw-eea"])).toBeNull();
    expect(regionFromTedPlaces(["EEA"])).toBeNull();
  });

  it("buckets mixed countries and low-volume countries into Europe (other)", () => {
    expect(regionFromTedPlaces(["IE061", "DE300"])).toBe("Europe (other)");
    expect(regionFromTedPlaces(["NOR"])).toBe("Europe (other)");
    expect(regionFromTedPlaces([])).toBeNull();
  });

  it("only ever returns publishable country-level regions", () => {
    const cases = [
      ["IE061", "IRL"],
      ["DE300"],
      ["MT001"],
      ["EL303"],
      ["NOR"],
      ["IE061", "DE300"],
      ["anyw-eea"],
    ];
    for (const places of cases) {
      const region = regionFromTedPlaces(places);
      if (region !== null) {
        expect(PUBLISHABLE_REGIONS).toContain(region);
      }
    }
  });
});

describe("broadRegionFromLocation", () => {
  it("maps UK NUTS2/NUTS3 codes to their NUTS1 region", () => {
    expect(broadRegionFromLocation(["UKD33"])).toBe("North West England");
    expect(broadRegionFromLocation(["UKI4"])).toBe("London");
  });

  it("does not match lowercase or ordinary words as NUTS codes", () => {
    expect(broadRegionFromLocation(["ukc"])).toBeNull();
    expect(broadRegionFromLocation(["Ukraine"])).toBeNull();
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

  it("falls back to TED place-of-performance countries when the buyer country is missing or unusable", () => {
    expect(
      previewRegion({
        sourceKey: "ted",
        locationParts: ["Germany"],
        buyer: { countryCode: null },
      }),
    ).toBe("Germany");
    expect(
      previewRegion({
        sourceKey: "ted",
        locationParts: ["Germany"],
        buyer: { countryCode: "GB" },
      }),
    ).toBe("Germany");
    expect(
      previewRegion({
        sourceKey: "ted",
        locationParts: ["Germany"],
        buyer: { countryCode: "SE" },
      }),
    ).toBe("Sweden");
    expect(
      previewRegion({
        sourceKey: "ted",
        locationParts: ["EEA"],
        buyer: null,
      }),
    ).toBeNull();
  });

  it("keeps every TED preview region publishable and country-level", () => {
    const inputs = [
      { locationParts: ["Germany"], buyer: { countryCode: null } },
      { locationParts: ["Germany"], buyer: { countryCode: "GB" } },
      { locationParts: ["Germany"], buyer: { countryCode: "SE" } },
      { locationParts: ["IE061", "IRL"], buyer: null },
      { locationParts: ["EL303"], buyer: null },
    ];
    for (const input of inputs) {
      const region = previewRegion({ sourceKey: "ted", ...input });
      expect(region).not.toBeNull();
      expect(PUBLISHABLE_REGIONS).toContain(region);
    }
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

import { describe, expect, it } from "vitest";

import {
  categoryFromCpv,
  categoryFromCpvs,
  categoryLabelFromContractNature,
  resolveMainCategory,
} from "@/ingestion/normalizers/taxonomy";

const ORIGINAL_PREFIXES: Array<[string, string, string]> = [
  ["09", "energy-utilities", "Energy & Utilities"],
  ["15", "food-catering", "Food & Catering"],
  ["30", "technology", "Technology"],
  ["32", "technology", "Technology"],
  ["33", "healthcare", "Healthcare"],
  ["39", "office-business-supplies", "Office & Business Supplies"],
  ["44", "construction-infrastructure", "Construction & Infrastructure"],
  ["45", "construction-infrastructure", "Construction & Infrastructure"],
  ["48", "technology", "Technology"],
  ["55", "food-catering", "Food & Catering"],
  ["60", "transport-logistics", "Transport & Logistics"],
  ["63", "transport-logistics", "Transport & Logistics"],
  ["64", "technology", "Technology"],
  ["65", "energy-utilities", "Energy & Utilities"],
  ["71", "professional-services", "Professional Services"],
  ["72", "technology", "Technology"],
  ["79", "professional-services", "Professional Services"],
  ["80", "education", "Education"],
  ["85", "healthcare", "Healthcare"],
  ["90", "energy-utilities", "Energy & Utilities"],
];

const NEW_PREFIXES: Array<[string, string, string]> = [
  ["03", "food-catering", "Food & Catering"],
  ["14", "manufacturing-industrial", "Manufacturing & Industrial"],
  ["16", "manufacturing-industrial", "Manufacturing & Industrial"],
  ["18", "other", "Other"],
  ["19", "manufacturing-industrial", "Manufacturing & Industrial"],
  ["22", "office-business-supplies", "Office & Business Supplies"],
  ["24", "manufacturing-industrial", "Manufacturing & Industrial"],
  ["31", "manufacturing-industrial", "Manufacturing & Industrial"],
  ["34", "transport-logistics", "Transport & Logistics"],
  ["35", "facilities-property", "Facilities & Property"],
  ["37", "other", "Other"],
  ["38", "technology", "Technology"],
  ["41", "energy-utilities", "Energy & Utilities"],
  ["42", "manufacturing-industrial", "Manufacturing & Industrial"],
  ["43", "construction-infrastructure", "Construction & Infrastructure"],
  ["50", "facilities-property", "Facilities & Property"],
  ["51", "facilities-property", "Facilities & Property"],
  ["66", "professional-services", "Professional Services"],
  ["70", "facilities-property", "Facilities & Property"],
  ["73", "professional-services", "Professional Services"],
  ["75", "professional-services", "Professional Services"],
  ["76", "energy-utilities", "Energy & Utilities"],
  ["77", "other", "Other"],
  ["92", "other", "Other"],
  ["98", "other", "Other"],
];

describe("categoryFromCpv", () => {
  it("keeps every original CPV division unchanged", () => {
    for (const [prefix, slug, label] of ORIGINAL_PREFIXES) {
      expect(categoryFromCpv(`${prefix}000000-1`), prefix).toMatchObject({ slug, label });
    }
  });

  it("maps every newly added CPV division to the expected taxonomy", () => {
    for (const [prefix, slug, label] of NEW_PREFIXES) {
      expect(categoryFromCpv(`${prefix}000000-1`), prefix).toMatchObject({ slug, label });
    }
  });

  it("accepts formatted codes such as 50000000-5 and 50.00", () => {
    expect(categoryFromCpv("50000000-5")).toMatchObject({
      slug: "facilities-property",
      label: "Facilities & Property",
    });
    expect(categoryFromCpv("50.00")).toMatchObject({
      slug: "facilities-property",
      label: "Facilities & Property",
    });
  });

  it("returns null for unknown, empty and malformed codes", () => {
    expect(categoryFromCpv(null)).toBeNull();
    expect(categoryFromCpv(undefined)).toBeNull();
    expect(categoryFromCpv("")).toBeNull();
    expect(categoryFromCpv("99")).toBeNull();
    expect(categoryFromCpv("00")).toBeNull();
    expect(categoryFromCpv("not a cpv")).toBeNull();
  });
});

describe("categoryFromCpvs", () => {
  it("returns the first mapped code after an unmapped primary", () => {
    expect(categoryFromCpvs(["99000000", "34000000"])).toMatchObject({
      slug: "transport-logistics",
      label: "Transport & Logistics",
    });
  });

  it("returns null when every code is unmapped", () => {
    expect(categoryFromCpvs(["99000000", null, undefined, "00000000"])).toBeNull();
  });

  it("returns the first mapped code when several map", () => {
    expect(categoryFromCpvs(["72000000", "50000000"])).toMatchObject({
      slug: "technology",
      label: "Technology",
    });
  });

  it("returns null for an empty list", () => {
    expect(categoryFromCpvs([])).toBeNull();
  });
});

describe("categoryLabelFromContractNature", () => {
  it("returns the coarse goods, services and works fallbacks", () => {
    expect(categoryLabelFromContractNature("services")).toBe("services");
    expect(categoryLabelFromContractNature("goods")).toBe("goods");
    expect(categoryLabelFromContractNature("works")).toBe("works");
  });

  it("maps TED supplies to goods", () => {
    expect(categoryLabelFromContractNature("supplies")).toBe("goods");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(categoryLabelFromContractNature("  SERVICES  ")).toBe("services");
    expect(categoryLabelFromContractNature("SupPlies")).toBe("goods");
  });

  it("returns null for unknown, empty and missing values", () => {
    expect(categoryLabelFromContractNature("consultancy")).toBeNull();
    expect(categoryLabelFromContractNature("")).toBeNull();
    expect(categoryLabelFromContractNature(null)).toBeNull();
    expect(categoryLabelFromContractNature(undefined)).toBeNull();
  });
});

describe("resolveMainCategory", () => {
  it("prefers a mapped CPV over the contract nature", () => {
    expect(resolveMainCategory(["50000000"], "services")).toBe(
      "Facilities & Property",
    );
  });

  it("falls back to the contract nature when no CPV maps", () => {
    expect(resolveMainCategory(["99000000"], "supplies")).toBe("goods");
  });

  it("returns null when neither mapping has a value", () => {
    expect(resolveMainCategory([], null)).toBeNull();
    expect(resolveMainCategory(["99000000"], "unknown")).toBeNull();
  });
});

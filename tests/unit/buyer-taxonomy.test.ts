import { describe, expect, it } from "vitest";

import { dealSectorFromClassifications } from "@/ingestion/normalizers/taxonomy";
import {
  BUYER_TYPES,
  DEAL_SECTORS,
  buyerTypeFromFunding,
  buyerTypeFromLegacySector,
  buyerTypeFromTedLegalType,
  buyerTypeFromUkCaType,
  sectorFromCofog,
  sectorFromCpv,
  sectorFromLegacySector,
  sectorFromText,
} from "@/lib/deals/buyer-taxonomy";

describe("buyer taxonomy", () => {
  it("defines the expected enums", () => {
    expect(BUYER_TYPES).toEqual(["PUBLIC", "PRIVATE"]);
    expect(DEAL_SECTORS).toHaveLength(16);
    expect(new Set(DEAL_SECTORS).size).toBe(16);
    expect(DEAL_SECTORS).toContain("CHARITY_NONPROFIT");
    expect(DEAL_SECTORS).not.toContain("PUBLIC");
  });

  it("maps CPV divisions", () => {
    expect(sectorFromCpv("09310000")).toBe("UTILITIES");
    expect(sectorFromCpv("85100000")).toBe("HEALTHCARE");
    expect(sectorFromCpv("80100000")).toBe("EDUCATION");
    expect(sectorFromCpv("45200000")).toBe("CONSTRUCTION_INFRASTRUCTURE");
    expect(sectorFromCpv("60100000")).toBe("TRANSPORT");
    expect(sectorFromCpv("72200000")).toBe("TECHNOLOGY");
    expect(sectorFromCpv("35000000")).toBe("DEFENCE_SECURITY");
    expect(sectorFromCpv("50700000")).toBe("FACILITIES_PROPERTY");
    expect(sectorFromCpv("79000000")).toBe("PROFESSIONAL_SERVICES");
    expect(sectorFromCpv("90000000")).toBe("ENVIRONMENT_WASTE");
    expect(sectorFromCpv("15000000")).toBe("FOOD_CATERING");
    expect(sectorFromCpv("42000000")).toBe("MANUFACTURING_EQUIPMENT");
    expect(sectorFromCpv("98000000")).toBe("OTHER");
    expect(sectorFromCpv(null)).toBe("OTHER");
  });

  it("maps COFOG and prefers it over CPV", () => {
    expect(sectorFromCofog("07")).toBe("HEALTHCARE");
    expect(sectorFromCofog("09")).toBe("EDUCATION");
    expect(sectorFromCofog("06")).toBe("HOUSING");
    expect(sectorFromCofog("10")).toBe("SOCIAL_CARE");
    expect(sectorFromCofog("04")).toBeNull();
    expect(
      dealSectorFromClassifications([
        { scheme: "CPV", id: "45200000" },
        { scheme: "COFOG", id: "07" },
      ]),
    ).toBe("HEALTHCARE");
  });

  it("maps text and legacy values", () => {
    expect(sectorFromText("Energy, Water and Wastewater")).toBe("UTILITIES");
    expect(sectorFromText("Health and Social Care")).toBe("HEALTHCARE");
    expect(sectorFromText("Children's social care")).toBe("SOCIAL_CARE");
    expect(sectorFromText("Rail infrastructure")).toBe("TRANSPORT");
    expect(sectorFromText("Unclassified")).toBe("OTHER");
    expect(buyerTypeFromLegacySector("PRIVATE")).toBe("PRIVATE");
    expect(buyerTypeFromLegacySector("NONPROFIT")).toBe("PRIVATE");
    expect(sectorFromLegacySector("NONPROFIT")).toBe("CHARITY_NONPROFIT");
    expect(sectorFromLegacySector("PUBLIC", "Software")).toBe("TECHNOLOGY");
  });

  it("maps buyer classifications and funding", () => {
    expect(
      buyerTypeFromUkCaType([{ scheme: "UK_CA_TYPE", id: "privateUtility" }]),
    ).toBe("PRIVATE");
    expect(
      buyerTypeFromUkCaType([{ scheme: "UK_CA_TYPE", id: "publicAuthority" }]),
    ).toBe("PUBLIC");
    expect(buyerTypeFromFunding("Public/Private Mix")).toBe("PUBLIC");
    expect(buyerTypeFromFunding("Private funding")).toBe("PRIVATE");
    expect(buyerTypeFromFunding("")).toBeNull();
  });

  it("maps every TED org-sub variant", () => {
    for (const value of [
      "spec-rights-entity",
      "org-sub",
      "org-sub-cga",
      "org-sub-ra",
      "org-sub-la",
      ["pub-undert", "ORG-SUB"],
    ]) {
      expect(buyerTypeFromTedLegalType(value)).toBe("PRIVATE");
    }
    for (const value of ["pub-undert", "cga", "body-pl", null]) {
      expect(buyerTypeFromTedLegalType(value)).toBe("PUBLIC");
    }
  });
});

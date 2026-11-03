import type { Database } from "@/lib/db/database.types";

export const BUYER_TYPES = [
  "PUBLIC",
  "PRIVATE",
] as const satisfies ReadonlyArray<Database["public"]["Enums"]["buyer_type"]>;

export type BuyerType = (typeof BUYER_TYPES)[number];

export const BUYER_TYPE_LABELS: Record<BuyerType, string> = {
  PUBLIC: "Public",
  PRIVATE: "Private",
};

export const DEAL_SECTORS = [
  "UTILITIES",
  "HEALTHCARE",
  "EDUCATION",
  "CONSTRUCTION_INFRASTRUCTURE",
  "TRANSPORT",
  "TECHNOLOGY",
  "DEFENCE_SECURITY",
  "FACILITIES_PROPERTY",
  "PROFESSIONAL_SERVICES",
  "ENVIRONMENT_WASTE",
  "HOUSING",
  "SOCIAL_CARE",
  "FOOD_CATERING",
  "MANUFACTURING_EQUIPMENT",
  "CHARITY_NONPROFIT",
  "OTHER",
] as const satisfies ReadonlyArray<Database["public"]["Enums"]["deal_sector"]>;

export type DealSector = (typeof DEAL_SECTORS)[number];

export const DEAL_SECTOR_LABELS: Record<DealSector, string> = {
  UTILITIES: "Utilities",
  HEALTHCARE: "Healthcare",
  EDUCATION: "Education",
  CONSTRUCTION_INFRASTRUCTURE: "Construction & infrastructure",
  TRANSPORT: "Transport",
  TECHNOLOGY: "Technology",
  DEFENCE_SECURITY: "Defence & security",
  FACILITIES_PROPERTY: "Facilities & property",
  PROFESSIONAL_SERVICES: "Professional services",
  ENVIRONMENT_WASTE: "Environment & waste",
  HOUSING: "Housing",
  SOCIAL_CARE: "Social care",
  FOOD_CATERING: "Food & catering",
  MANUFACTURING_EQUIPMENT: "Manufacturing & equipment",
  CHARITY_NONPROFIT: "Charity and non-profit",
  OTHER: "Other",
};

const CPV_SECTOR_PREFIXES: ReadonlyArray<readonly [string, DealSector]> = [
  ["09", "UTILITIES"],
  ["40", "UTILITIES"],
  ["41", "UTILITIES"],
  ["65", "UTILITIES"],
  ["76", "UTILITIES"],
  ["33", "HEALTHCARE"],
  ["85", "HEALTHCARE"],
  ["80", "EDUCATION"],
  ["44", "CONSTRUCTION_INFRASTRUCTURE"],
  ["45", "CONSTRUCTION_INFRASTRUCTURE"],
  ["71", "CONSTRUCTION_INFRASTRUCTURE"],
  ["34", "TRANSPORT"],
  ["60", "TRANSPORT"],
  ["63", "TRANSPORT"],
  ["30", "TECHNOLOGY"],
  ["32", "TECHNOLOGY"],
  ["38", "TECHNOLOGY"],
  ["48", "TECHNOLOGY"],
  ["64", "TECHNOLOGY"],
  ["72", "TECHNOLOGY"],
  ["73", "TECHNOLOGY"],
  ["35", "DEFENCE_SECURITY"],
  ["50", "FACILITIES_PROPERTY"],
  ["51", "FACILITIES_PROPERTY"],
  ["70", "FACILITIES_PROPERTY"],
  ["66", "PROFESSIONAL_SERVICES"],
  ["74", "PROFESSIONAL_SERVICES"],
  ["79", "PROFESSIONAL_SERVICES"],
  ["90", "ENVIRONMENT_WASTE"],
  ["03", "FOOD_CATERING"],
  ["15", "FOOD_CATERING"],
  ["55", "FOOD_CATERING"],
  ["77", "FOOD_CATERING"],
  ["14", "MANUFACTURING_EQUIPMENT"],
  ["18", "MANUFACTURING_EQUIPMENT"],
  ["19", "MANUFACTURING_EQUIPMENT"],
  ["31", "MANUFACTURING_EQUIPMENT"],
  ["42", "MANUFACTURING_EQUIPMENT"],
  ["43", "MANUFACTURING_EQUIPMENT"],
  ["98", "OTHER"],
];

const COFOG_SECTOR_PREFIXES: ReadonlyArray<readonly [string, DealSector]> = [
  ["06", "HOUSING"],
  ["07", "HEALTHCARE"],
  ["09", "EDUCATION"],
  ["10", "SOCIAL_CARE"],
];

export function sectorFromCpv(code: string | null | undefined): DealSector {
  if (!code) {
    return "OTHER";
  }
  const prefix = code.replace(/\D/g, "").slice(0, 2);
  return (
    CPV_SECTOR_PREFIXES.find((entry) => entry[0] === prefix)?.[1] ?? "OTHER"
  );
}

export function sectorFromCofog(code: string | null | undefined): DealSector | null {
  if (!code) {
    return null;
  }
  const prefix = code.replace(/\D/g, "").slice(0, 2);
  return COFOG_SECTOR_PREFIXES.find((entry) => entry[0] === prefix)?.[1] ?? null;
}

export function sectorFromText(value: string | null | undefined): DealSector {
  const text = (value ?? "").toLowerCase();
  if (!text.trim()) {
    return "OTHER";
  }
  if (/\b(social care|adult care|childcare|children's care|domiciliary care)\b/.test(text) && !/\bhealth\b/.test(text)) {
    return "SOCIAL_CARE";
  }
  if (/\b(nhs|health|hospital|medical|clinical|pharmaceutical|social care)\b/.test(text)) {
    return "HEALTHCARE";
  }
  if (/\b(education|school|university|college|academy|training|learning)\b/.test(text)) {
    return "EDUCATION";
  }
  if (/\b(utility|utilities|energy|water|wastewater|gas|electric|electricity|power|grid|transmission|nuclear|oil)\b/.test(text)) {
    return "UTILITIES";
  }
  if (/\b(transport|rail|railway|road|highway|bus|coach|aviation|airport|port|shipping|maritime|fleet|logistics)\b/.test(text)) {
    return "TRANSPORT";
  }
  if (/\b(defence|defense|military|security|police|fire service|cyber security)\b/.test(text)) {
    return "DEFENCE_SECURITY";
  }
  if (/\b(environment|waste|recycling|pollution|conservation|green|decarbonisation)\b/.test(text)) {
    return "ENVIRONMENT_WASTE";
  }
  if (/\b(housing|homes|residential|regeneration|homelessness)\b/.test(text)) {
    return "HOUSING";
  }
  if (/\b(facilities|property|estate|real estate|cleaning|maintenance|repairs)\b/.test(text)) {
    return "FACILITIES_PROPERTY";
  }
  if (/\b(food|catering|meals|drink|beverage|agriculture|farming|forestry)\b/.test(text)) {
    return "FOOD_CATERING";
  }
  if (/\b(technology|software|hardware|digital|data|computing|computer|cloud|network|telecom|information technology|cyber|artificial intelligence|ai)\b/.test(text)) {
    return "TECHNOLOGY";
  }
  if (/\b(manufacturing|manufacture|equipment|machinery|industrial|engineering|vehicles|materials)\b/.test(text)) {
    return "MANUFACTURING_EQUIPMENT";
  }
  if (/\b(charity|charitable|non-profit|nonprofit|not-for-profit|voluntary)\b/.test(text)) {
    return "CHARITY_NONPROFIT";
  }
  if (/\b(professional|consultancy|consulting|legal|financial|finance|audit|accounting|human resources|recruitment|marketing|advertising|business services)\b/.test(text)) {
    return "PROFESSIONAL_SERVICES";
  }
  if (/\b(construction|infrastructure|building|civil engineering|works)\b/.test(text)) {
    return "CONSTRUCTION_INFRASTRUCTURE";
  }
  return "OTHER";
}

export function buyerTypeFromFunding(
  value: string | null | undefined,
): BuyerType | null {
  const funding = (value ?? "").toLowerCase();
  const hasPublic = /\bpublic\b/.test(funding);
  const hasPrivate = /\bprivate\b/.test(funding);
  if (hasPublic) {
    return "PUBLIC";
  }
  if (hasPrivate) {
    return "PRIVATE";
  }
  return null;
}

export function buyerTypeFromUkCaType(
  classifications: Array<{ scheme?: string | null; id?: string | null }>,
): BuyerType {
  const privateUtility = classifications.some(
    (item) =>
      item.scheme?.trim().toLowerCase() === "uk_ca_type" &&
      item.id?.trim().toLowerCase() === "privateutility",
  );
  return privateUtility ? "PRIVATE" : "PUBLIC";
}

/**
 * TED notices are EU public procurement notices, so the buyer is PUBLIC.
 * eForms legal types `spec-rights-entity` (special or exclusive rights,
 * mostly state-owned utilities) and `org-sub*` (contracts subsidised by a
 * contracting authority) are not clearly private, so they stay PUBLIC too.
 * Only an explicit private marker flips the result.
 */
export const TED_CLEARLY_PRIVATE_LEGAL_TYPES: readonly string[] = ["private", "private-body"];

export function buyerTypeFromTedLegalType(value: unknown): BuyerType {
  const legalTypes: string[] = [];
  collectStrings(value, legalTypes);
  return legalTypes.some((item) => TED_CLEARLY_PRIVATE_LEGAL_TYPES.includes(item))
    ? "PRIVATE"
    : "PUBLIC";
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized) {
      out.push(normalized);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, out);
    }
  }
}

export function buyerTypeFromLegacySector(
  sector: string | null | undefined,
): BuyerType {
  return sector === "PRIVATE" || sector === "NONPROFIT" ? "PRIVATE" : "PUBLIC";
}

export function sectorFromLegacySector(
  sector: string | null | undefined,
  category?: string | null,
): DealSector {
  switch (sector) {
    case "UTILITY":
      return "UTILITIES";
    case "HEALTHCARE":
      return "HEALTHCARE";
    case "EDUCATION":
      return "EDUCATION";
    case "NONPROFIT":
      return "CHARITY_NONPROFIT";
    default:
      return sectorFromText(category);
  }
}

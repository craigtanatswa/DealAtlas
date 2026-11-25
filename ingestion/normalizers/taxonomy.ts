import type { BuyerSector } from "@/lib/constants";
import {
  buyerTypeFromUkCaType,
  sectorFromCofog,
  sectorFromCpv,
  sectorFromText,
  type BuyerType,
  type DealSector,
} from "@/lib/deals/buyer-taxonomy";
import type { DealStage, DealStatus, DealType } from "@/lib/search/filters";

const CPV_CATEGORY: Array<{ prefix: string; slug: string; label: string }> = [
  { prefix: "45", slug: "construction-infrastructure", label: "Construction & Infrastructure" },
  { prefix: "44", slug: "construction-infrastructure", label: "Construction & Infrastructure" },
  { prefix: "72", slug: "technology", label: "Technology" },
  { prefix: "48", slug: "technology", label: "Technology" },
  { prefix: "30", slug: "technology", label: "Technology" },
  { prefix: "32", slug: "technology", label: "Technology" },
  { prefix: "64", slug: "technology", label: "Technology" },
  { prefix: "85", slug: "healthcare", label: "Healthcare" },
  { prefix: "33", slug: "healthcare", label: "Healthcare" },
  { prefix: "80", slug: "education", label: "Education" },
  { prefix: "55", slug: "food-catering", label: "Food & Catering" },
  { prefix: "15", slug: "food-catering", label: "Food & Catering" },
  { prefix: "60", slug: "transport-logistics", label: "Transport & Logistics" },
  { prefix: "63", slug: "transport-logistics", label: "Transport & Logistics" },
  { prefix: "09", slug: "energy-utilities", label: "Energy & Utilities" },
  { prefix: "65", slug: "energy-utilities", label: "Energy & Utilities" },
  { prefix: "90", slug: "energy-utilities", label: "Energy & Utilities" },
  { prefix: "79", slug: "professional-services", label: "Professional Services" },
  { prefix: "71", slug: "professional-services", label: "Professional Services" },
  { prefix: "39", slug: "office-business-supplies", label: "Office & Business Supplies" },
  // 03 Agricultural, farming, fishing, forestry and related products
  { prefix: "03", slug: "food-catering", label: "Food & Catering" },
  // 14 Mining, basic metals and related products
  { prefix: "14", slug: "manufacturing-industrial", label: "Manufacturing & Industrial" },
  // 16 Agricultural machinery
  { prefix: "16", slug: "manufacturing-industrial", label: "Manufacturing & Industrial" },
  // 18 Clothing, footwear, luggage articles and accessories
  { prefix: "18", slug: "other", label: "Other" },
  // 19 Leather and textile fabrics, plastic and rubber materials
  { prefix: "19", slug: "manufacturing-industrial", label: "Manufacturing & Industrial" },
  // 22 Printed matter and related products
  { prefix: "22", slug: "office-business-supplies", label: "Office & Business Supplies" },
  // 24 Chemical products
  { prefix: "24", slug: "manufacturing-industrial", label: "Manufacturing & Industrial" },
  // 31 Electrical machinery, apparatus, equipment and consumables; lighting
  { prefix: "31", slug: "manufacturing-industrial", label: "Manufacturing & Industrial" },
  // 34 Transport equipment and auxiliary products to transportation
  { prefix: "34", slug: "transport-logistics", label: "Transport & Logistics" },
  // 35 Security, fire-fighting, police and defence equipment
  { prefix: "35", slug: "facilities-property", label: "Facilities & Property" },
  // 37 Musical instruments, sport goods, games, toys, handicraft, art materials
  { prefix: "37", slug: "other", label: "Other" },
  // 38 Laboratory, optical and precision equipments
  { prefix: "38", slug: "technology", label: "Technology" },
  // 41 Collected and purified water
  { prefix: "41", slug: "energy-utilities", label: "Energy & Utilities" },
  // 42 Industrial machinery
  { prefix: "42", slug: "manufacturing-industrial", label: "Manufacturing & Industrial" },
  // 43 Machinery for mining, quarrying, construction equipment
  { prefix: "43", slug: "construction-infrastructure", label: "Construction & Infrastructure" },
  // 50 Repair and maintenance services
  { prefix: "50", slug: "facilities-property", label: "Facilities & Property" },
  // 51 Installation services (except software)
  { prefix: "51", slug: "facilities-property", label: "Facilities & Property" },
  // 66 Financial and insurance services
  { prefix: "66", slug: "professional-services", label: "Professional Services" },
  // 70 Real estate services
  { prefix: "70", slug: "facilities-property", label: "Facilities & Property" },
  // 73 Research and development services and related consultancy
  { prefix: "73", slug: "professional-services", label: "Professional Services" },
  // 75 Administration, defence and social security services
  { prefix: "75", slug: "professional-services", label: "Professional Services" },
  // 76 Services related to the oil and gas industry
  { prefix: "76", slug: "energy-utilities", label: "Energy & Utilities" },
  // 77 Agricultural, forestry, horticultural, aquacultural and apicultural services
  { prefix: "77", slug: "other", label: "Other" },
  // 92 Recreational, cultural and sporting services
  { prefix: "92", slug: "other", label: "Other" },
  // 98 Other community, social and personal services
  { prefix: "98", slug: "other", label: "Other" },
];

const CONTRACT_NATURE_LABELS: Readonly<Record<string, string>> = {
  goods: "goods",
  services: "services",
  works: "works",
  supplies: "goods",
};

export function categoryFromCpv(
  code: string | null | undefined,
): { slug: string; label: string } | null {
  if (!code) {
    return null;
  }
  const prefix = code.replace(/\D/g, "").slice(0, 2);
  const match = CPV_CATEGORY.find((entry) => entry.prefix === prefix);
  return match ? { slug: match.slug, label: match.label } : null;
}

export function categoryFromCpvs(
  codes: Array<string | null | undefined>,
): { slug: string; label: string } | null {
  for (const code of codes) {
    const category = categoryFromCpv(code);
    if (category) {
      return category;
    }
  }
  return null;
}

export function categoryLabelFromContractNature(
  nature: string | null | undefined,
): string | null {
  if (!nature) {
    return null;
  }
  return CONTRACT_NATURE_LABELS[nature.trim().toLowerCase()] ?? null;
}

export function resolveMainCategory(
  codes: Array<string | null | undefined>,
  nature: string | null | undefined,
): string | null {
  return (
    categoryFromCpvs(codes)?.label ??
    categoryLabelFromContractNature(nature) ??
    null
  );
}

export function buyerSectorFromClassifications(
  schemes: Array<{ scheme?: string | null; id?: string | null; description?: string | null }>,
): BuyerSector {
  const privateUtility = schemes.some(
    (item) =>
      item.scheme?.trim().toLowerCase() === "uk_ca_type" &&
      item.id?.trim().toLowerCase() === "privateutility",
  );
  if (privateUtility) {
    return "PRIVATE";
  }

  const blob = schemes
    .map((item) => `${item.id ?? ""} ${item.description ?? ""}`.toLowerCase())
    .join(" ");

  if (/\b(nhs|health|hospital)\b/.test(blob)) {
    return "HEALTHCARE";
  }
  if (/\b(school|university|college|education)\b/.test(blob)) {
    return "EDUCATION";
  }
  if (/\b(utility|water|energy|gas|electric)\b/.test(blob)) {
    return "UTILITY";
  }
  if (/\b(charity|voluntary|non-profit|nonprofit)\b/.test(blob)) {
    return "NONPROFIT";
  }
  return "PUBLIC";
}

export function buyerTypeFromClassifications(
  schemes: Array<{ scheme?: string | null; id?: string | null; description?: string | null }>,
): BuyerType {
  if (buyerTypeFromUkCaType(schemes) === "PRIVATE") {
    return "PRIVATE";
  }
  const sector = buyerSectorFromClassifications(schemes);
  return sector === "PRIVATE" || sector === "NONPROFIT" ? "PRIVATE" : "PUBLIC";
}

export function dealSectorFromClassifications(
  schemes: Array<{ scheme?: string | null; id?: string | null; description?: string | null }>,
): DealSector {
  for (const item of schemes) {
    const scheme = item.scheme?.trim().toLowerCase() ?? "";
    if (scheme === "cofog") {
      const sector = sectorFromCofog(item.id);
      if (sector) {
        return sector;
      }
    }
  }

  for (const item of schemes) {
    const scheme = item.scheme?.trim().toLowerCase() ?? "";
    if (scheme === "cpv") {
      const sector = sectorFromCpv(item.id);
      if (sector !== "OTHER") {
        return sector;
      }
    }
  }

  for (const item of schemes) {
    const textSector = sectorFromText(`${item.id ?? ""} ${item.description ?? ""}`);
    if (textSector !== "OTHER") {
      return textSector;
    }
  }

  return "OTHER";
}

export function mapDealType(input: {
  tags: string[];
  hasFramework: boolean;
  hasDynamicMarket: boolean;
  tenderStatus?: string | null;
}): DealType {
  if (input.hasDynamicMarket) {
    return "DYNAMIC_MARKET";
  }
  if (input.hasFramework) {
    return "FRAMEWORK";
  }
  if (input.tags.includes("planning") && !input.tags.includes("tender")) {
    return "PROCUREMENT_PIPELINE";
  }
  if (
    (input.tags.includes("award") || input.tags.includes("contract")) &&
    !input.tags.includes("tender") &&
    input.tenderStatus !== "active"
  ) {
    return "AWARD";
  }
  return "PUBLIC_TENDER";
}

export function mapDealStage(input: {
  tags: string[];
  tenderStatus?: string | null;
  hasAwards: boolean;
  hasContracts: boolean;
}): DealStage {
  const status = input.tenderStatus?.toLowerCase() ?? "";
  if (status === "cancelled" || status === "withdrawn" || status === "unsuccessful") {
    return "ENDED";
  }
  if (input.hasContracts || input.tags.includes("contract")) {
    return "CONTRACT";
  }
  if (input.hasAwards || input.tags.includes("award")) {
    return "AWARD";
  }
  if (input.tags.includes("planning") || status === "planned") {
    return "PLANNING";
  }
  if (input.tags.includes("tender") || status === "active") {
    return "LIVE";
  }
  return "LIVE";
}

const TENDER_TAGS = new Set(["tender", "tenderupdate", "tenderamendment"]);
const PLANNING_TAGS = new Set(["planning", "planningupdate"]);

function instant(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function mapDealStatus(input: {
  tenderStatus?: string | null;
  lotStatus?: string | null;
  tags: string[];
  submissionDeadline?: string | null;
  /** Planning notices: the dated moment a future tender is expected. */
  futureTenderDate?: string | null;
  now: Date;
  hasAwards: boolean;
}): DealStatus {
  const status = (input.lotStatus ?? input.tenderStatus ?? "").toLowerCase();
  const tags = input.tags.map((tag) => tag.toLowerCase());
  if (status === "withdrawn" || tags.includes("tendercancellation")) {
    return "WITHDRAWN";
  }
  if (status === "cancelled") {
    return "CANCELLED";
  }
  if (status === "unsuccessful") {
    return "CLOSED";
  }
  if (status === "complete" || input.hasAwards || tags.includes("award")) {
    return input.hasAwards ? "AWARDED" : "CLOSED";
  }
  if (tags.includes("contract") && status !== "active") {
    return "ACTIVE";
  }

  const tenderNotice = tags.some((tag) => TENDER_TAGS.has(tag));
  const deadline = instant(input.submissionDeadline);
  if (tenderNotice && deadline != null) {
    if (deadline < input.now.getTime()) {
      return "CLOSED";
    }
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (deadline - input.now.getTime() <= sevenDays) {
      return "CLOSING_SOON";
    }
    return "OPEN";
  }

  // A live tender notice with no dated deadline is still open.
  if (tenderNotice && status === "active") {
    return "OPEN";
  }

  const planningNotice =
    status === "planned" || tags.some((tag) => PLANNING_TAGS.has(tag));
  const futureTender = instant(input.futureTenderDate);
  if (planningNotice && futureTender != null && futureTender > input.now.getTime()) {
    return "UPCOMING";
  }

  return "UNCLASSIFIED";
}

export function mapRequirementType(value: string | null | undefined): "TECHNICAL" | "FINANCIAL" | "LEGAL" | "SECURITY" | "COMPLIANCE" | "INSURANCE" | "EXPERIENCE" | "SOCIAL_VALUE" | "OTHER" {
  const text = (value ?? "").toLowerCase();
  if (text.includes("economic") || text.includes("financial") || text.includes("turnover")) {
    return "FINANCIAL";
  }
  if (text.includes("technical") || text.includes("quality")) {
    return "TECHNICAL";
  }
  if (text.includes("insurance")) {
    return "INSURANCE";
  }
  if (text.includes("security") || text.includes("cyber")) {
    return "SECURITY";
  }
  if (text.includes("legal") || text.includes("law")) {
    return "LEGAL";
  }
  if (text.includes("social")) {
    return "SOCIAL_VALUE";
  }
  if (text.includes("experience") || text.includes("suitability")) {
    return "EXPERIENCE";
  }
  if (text.includes("compliance") || text.includes("selection")) {
    return "COMPLIANCE";
  }
  return "OTHER";
}

export function mapOrganizationRole(role: string): import("@/lib/db/database.types").Database["public"]["Enums"]["organization_role"] | null {
  switch (role) {
    case "buyer":
      return "BUYER";
    case "procuringEntity":
      return "LEAD_BUYER";
    case "centralPurchasingBody":
      return "FRAMEWORK_AUTHORITY";
    case "supplier":
    case "tenderer":
      return "SUPPLIER";
    case "funder":
      return "FUNDER";
    default:
      return null;
  }
}

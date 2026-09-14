import type { BuyerSector } from "@/lib/constants";
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
];

export function categoryFromCpv(
  code: string | null | undefined,
): { slug: string; label: string } | null {
  if (!code) {
    return null;
  }
  const prefix = code.replace(/\D/g, "").slice(0, 2);
  return CPV_CATEGORY.find((entry) => entry.prefix === prefix) ?? null;
}

export function buyerSectorFromClassifications(
  schemes: Array<{ scheme?: string | null; id?: string | null; description?: string | null }>,
): BuyerSector {
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

export function mapDealStatus(input: {
  tenderStatus?: string | null;
  lotStatus?: string | null;
  tags: string[];
  submissionDeadline?: string | null;
  now: Date;
  hasAwards: boolean;
}): DealStatus {
  const status = (input.lotStatus ?? input.tenderStatus ?? "").toLowerCase();
  if (status === "withdrawn") {
    return "WITHDRAWN";
  }
  if (status === "cancelled") {
    return "CANCELLED";
  }
  if (status === "unsuccessful") {
    return "CLOSED";
  }
  if (status === "planned") {
    return "UPCOMING";
  }
  if (status === "complete" || input.hasAwards || input.tags.includes("award")) {
    return input.hasAwards ? "AWARDED" : "CLOSED";
  }
  if (input.tags.includes("contract") && status !== "active") {
    return "ACTIVE";
  }
  if (status === "active" || input.tags.includes("tender")) {
    if (input.submissionDeadline) {
      const deadline = new Date(input.submissionDeadline);
      if (!Number.isNaN(deadline.getTime())) {
        if (deadline.getTime() < input.now.getTime()) {
          return "CLOSED";
        }
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (deadline.getTime() - input.now.getTime() <= sevenDays) {
          return "CLOSING_SOON";
        }
      }
    }
    return "OPEN";
  }
  return "OPEN";
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

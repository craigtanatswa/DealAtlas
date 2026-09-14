import { format } from "date-fns";

import type { Database } from "@/lib/db/database.types";

export type RequirementType = Database["public"]["Enums"]["requirement_type"];

export const REQUIREMENT_TYPE_LABELS: Record<RequirementType, string> = {
  TECHNICAL: "Technical",
  FINANCIAL: "Financial",
  LEGAL: "Legal",
  SECURITY: "Security",
  COMPLIANCE: "Compliance",
  INSURANCE: "Insurance",
  EXPERIENCE: "Experience",
  SOCIAL_VALUE: "Social value",
  OTHER: "Other",
};

export function formatDealDateTime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return format(new Date(parsed), "d MMMM yyyy, HH:mm");
}

export function formatDealDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return format(new Date(parsed), "d MMMM yyyy");
}

export function formatDealMoney(
  value: number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency ?? "GBP"} ${value}`;
  }
}

export function formatDealValueRange(input: {
  exactValueText: string | null;
  valueMinExVat: number | null;
  valueMaxExVat: number | null;
  currency: string | null;
}): string | null {
  if (input.exactValueText?.trim()) {
    return input.exactValueText.trim();
  }

  const min = formatDealMoney(input.valueMinExVat, input.currency);
  const max = formatDealMoney(input.valueMaxExVat, input.currency);
  if (min && max && min !== max) {
    return `${min}–${max} ex VAT`;
  }
  return min ?? max;
}

export function yesNoLabel(value: boolean | null | undefined): string {
  if (value === true) {
    return "Yes";
  }
  if (value === false) {
    return "No";
  }
  return "Not stated";
}

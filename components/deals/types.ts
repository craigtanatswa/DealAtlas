import type { BuyerSector } from "@/lib/constants";
import type { Database } from "@/lib/db/database.types";

export type DealStatus = Database["public"]["Enums"]["deal_status"];

export type SuitabilityLevel = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export type DealCardData = {
  slug: string;
  previewTitle: string;
  previewSummary: string;
  buyerSector: BuyerSector;
  mainCategory: string | null;
  broadRegion: string | null;
  valueBand: string | null;
  deadlineBand: string | null;
  smeSuitability: SuitabilityLevel | null;
  bidComplexity: SuitabilityLevel | null;
  status: DealStatus;
  freshnessLabel?: string | null;
  matchScore?: number | null;
  matchReasons?: string[];
};

export function buyerVisibilityLabel(sector: BuyerSector): "Public" | "Private" {
  return sector === "PUBLIC" ? "Public" : "Private";
}

export function levelLabel(level: SuitabilityLevel | null, fallback: string) {
  if (!level || level === "UNKNOWN") {
    return fallback;
  }

  return `${level.charAt(0)}${level.slice(1).toLowerCase()}`;
}

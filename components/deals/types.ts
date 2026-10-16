import { BUYER_SECTOR_LABELS, type BuyerSector } from "@/lib/constants";
import type { Database } from "@/lib/db/database.types";
import type { DealType } from "@/lib/search/filters";

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
  dealType?: DealType;
  relevanceTags?: string[];
  freshnessLabel?: string | null;
  matchScore?: number | null;
  matchReasons?: string[];
};

export function buyerSectorLabel(
  sector: BuyerSector,
  dealType?: DealType | null,
): string | null {
  if (sector === "PRIVATE" && dealType === "PUBLIC_TENDER") {
    return null;
  }
  if (sector === "PUBLIC" && dealType === "PRIVATE_TENDER") {
    return null;
  }
  return BUYER_SECTOR_LABELS[sector];
}

export function levelLabel(level: SuitabilityLevel | null, fallback: string) {
  if (!level || level === "UNKNOWN") {
    return fallback;
  }

  return `${level.charAt(0)}${level.slice(1).toLowerCase()}`;
}

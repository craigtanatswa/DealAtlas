import { BUYER_SECTOR_LABELS, BUYER_SECTORS } from "@/lib/constants";
import type { Database } from "@/lib/db/database.types";

export const DEAL_TYPES = [
  "PUBLIC_TENDER",
  "PRIVATE_TENDER",
  "RFP",
  "RFQ",
  "RFI",
  "EOI",
  "SUPPLY_CHAIN_OPPORTUNITY",
  "SUBCONTRACT_OPPORTUNITY",
  "FRAMEWORK",
  "DYNAMIC_MARKET",
  "PROCUREMENT_PIPELINE",
  "SUPPLIER_SEARCH",
  "EARLY_MARKET_ENGAGEMENT",
  "CONTRACT_RENEWAL",
  "AWARD",
] as const satisfies ReadonlyArray<Database["public"]["Enums"]["deal_type"]>;

export type DealType = (typeof DEAL_TYPES)[number];

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  PUBLIC_TENDER: "Public tender",
  PRIVATE_TENDER: "Private tender",
  RFP: "RFP",
  RFQ: "RFQ",
  RFI: "RFI",
  EOI: "Expression of interest",
  SUPPLY_CHAIN_OPPORTUNITY: "Supply chain",
  SUBCONTRACT_OPPORTUNITY: "Subcontract",
  FRAMEWORK: "Framework",
  DYNAMIC_MARKET: "Dynamic market",
  PROCUREMENT_PIPELINE: "Procurement pipeline",
  SUPPLIER_SEARCH: "Supplier search",
  EARLY_MARKET_ENGAGEMENT: "Early market engagement",
  CONTRACT_RENEWAL: "Contract renewal",
  AWARD: "Award",
};

export const DEAL_STATUSES = [
  "UPCOMING",
  "OPEN",
  "CLOSING_SOON",
  "CLOSED",
  "AWARDED",
  "CANCELLED",
  "ACTIVE",
  "EXPIRED",
  "WITHDRAWN",
] as const satisfies ReadonlyArray<Database["public"]["Enums"]["deal_status"]>;

export type DealStatus = (typeof DEAL_STATUSES)[number];

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  UPCOMING: "Upcoming",
  OPEN: "Open",
  CLOSING_SOON: "Closing soon",
  CLOSED: "Closed",
  AWARDED: "Awarded",
  CANCELLED: "Cancelled",
  ACTIVE: "Active",
  EXPIRED: "Expired",
  WITHDRAWN: "Withdrawn",
};

export const DEAL_STAGES = [
  "EARLY",
  "PLANNING",
  "LIVE",
  "AWARD",
  "CONTRACT",
  "ENDED",
] as const satisfies ReadonlyArray<Database["public"]["Enums"]["deal_stage"]>;

export type DealStage = (typeof DEAL_STAGES)[number];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  EARLY: "Early",
  PLANNING: "Planning",
  LIVE: "Live",
  AWARD: "Award",
  CONTRACT: "Contract",
  ENDED: "Ended",
};

/**
 * Category names from the reference seed. Public search cannot read `categories`.
 */
export const DEAL_CATEGORY_OPTIONS = [
  "Technology",
  "Professional Services",
  "Construction & Infrastructure",
  "Facilities & Property",
  "Healthcare",
  "Education",
  "Transport & Logistics",
  "Manufacturing & Industrial",
  "Marketing & Creative",
  "Food & Catering",
  "Energy & Utilities",
  "Office & Business Supplies",
  "Other",
] as const;

export const UK_REGION_OPTIONS = [
  "Nationwide",
  "London",
  "South East England",
  "South West England",
  "East of England",
  "East Midlands",
  "West Midlands",
  "Yorkshire and the Humber",
  "North West England",
  "North East England",
  "Scotland",
  "Wales",
  "Northern Ireland",
  "Remote",
] as const;

export const VALUE_BAND_OPTIONS = [
  "Under £50k",
  "£50k–£100k",
  "£100k–£250k",
  "£250k–£500k",
  "£500k–£1m",
  "£1m–£5m",
  "Over £5m",
] as const;

export const DEADLINE_BAND_OPTIONS = [
  "Within 7 days",
  "Within 3 weeks",
  "Within 1 month",
  "Closing soon",
  "Upcoming",
] as const;

export const BUYER_SECTOR_OPTIONS = BUYER_SECTORS.map((value) => ({
  value,
  label: BUYER_SECTOR_LABELS[value],
}));

export const DEAL_TYPE_OPTIONS = DEAL_TYPES.map((value) => ({
  value,
  label: DEAL_TYPE_LABELS[value],
}));

export const DEAL_STATUS_OPTIONS = DEAL_STATUSES.map((value) => ({
  value,
  label: DEAL_STATUS_LABELS[value],
}));

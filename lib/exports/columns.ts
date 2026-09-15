import {
  assertPaidDealDto,
  type PaidDealDto,
} from "@/lib/deals/paid-dto";
import { csvCellValue } from "@/lib/exports/csv";

export const DEAL_EXPORT_COLUMNS = [
  { key: "id", header: "deal_id" },
  { key: "sourceTitle", header: "source_title" },
  { key: "sourceDescription", header: "source_description" },
  { key: "reference", header: "reference" },
  { key: "ocid", header: "ocid" },
  { key: "externalPrimaryId", header: "external_primary_id" },
  { key: "dealType", header: "deal_type" },
  { key: "buyerSector", header: "buyer_sector" },
  { key: "stage", header: "stage" },
  { key: "status", header: "status" },
  { key: "mainCategory", header: "main_category" },
  { key: "procurementMethod", header: "procurement_method" },
  { key: "specialRegime", header: "special_regime" },
  { key: "currency", header: "currency" },
  { key: "valueMinExVat", header: "value_min_ex_vat" },
  { key: "valueMaxExVat", header: "value_max_ex_vat" },
  { key: "exactValueText", header: "exact_value_text" },
  { key: "exactLocationText", header: "exact_location_text" },
  { key: "enquiryDeadline", header: "enquiry_deadline" },
  { key: "submissionDeadline", header: "submission_deadline" },
  { key: "awardDecisionDate", header: "award_decision_date" },
  { key: "contractStartDate", header: "contract_start_date" },
  { key: "contractEndDate", header: "contract_end_date" },
  { key: "extensionEndDate", header: "extension_end_date" },
  { key: "nextProcurementDate", header: "next_procurement_date" },
  { key: "estimatedRenewalDate", header: "estimated_renewal_date" },
  { key: "smeSuitable", header: "sme_suitable" },
  { key: "vcseSuitable", header: "vcse_suitable" },
  { key: "sourceUrl", header: "source_url" },
  { key: "applicationUrl", header: "application_url" },
  { key: "firstPublishedAt", header: "first_published_at" },
  { key: "latestSourceAt", header: "latest_source_at" },
  { key: "buyerName", header: "buyer_name" },
  { key: "buyerWebsite", header: "buyer_website" },
  { key: "buyerDomain", header: "buyer_domain" },
  { key: "buyerEmail", header: "buyer_email" },
  { key: "buyerPhone", header: "buyer_phone" },
  { key: "buyerCity", header: "buyer_city" },
  { key: "buyerRegion", header: "buyer_region" },
  { key: "buyerCountryCode", header: "buyer_country_code" },
  { key: "contactName", header: "contact_name" },
  { key: "contactEmail", header: "contact_email" },
  { key: "contactPhone", header: "contact_phone" },
  { key: "sourceName", header: "source_name" },
  { key: "sourceKey", header: "source_key" },
  { key: "sourceType", header: "source_type" },
  { key: "sourceBaseUrl", header: "source_base_url" },
] as const;

export type DealExportColumnKey = (typeof DEAL_EXPORT_COLUMNS)[number]["key"];

export type DealExportRow = Record<DealExportColumnKey, string>;

export const EXPORT_INTERNAL_KEYS = [
  "data_quality_score",
  "source_count",
  "created_at",
  "updated_at",
  "first_discovered_at",
  "last_verified_at",
  "scraping_permitted",
  "reuse_status",
  "access_method",
  "enabled",
  "api_url",
  "compliance_notes",
  "consecutive_failures",
  "rate_limit_per_minute",
  "processing_status",
  "protected_payload",
  "extracted_text",
  "previous_value",
  "new_value",
  "dodo_customer_id",
  "dodo_subscription_id",
  "dodo_product_id",
  "payload",
  "payload_hash",
] as const;

export function paidDealToExportRow(deal: PaidDealDto): DealExportRow {
  assertPaidDealDto(deal);
  return {
    id: csvCellValue(deal.id),
    sourceTitle: csvCellValue(deal.sourceTitle),
    sourceDescription: csvCellValue(deal.sourceDescription),
    reference: csvCellValue(deal.reference),
    ocid: csvCellValue(deal.ocid),
    externalPrimaryId: csvCellValue(deal.externalPrimaryId),
    dealType: csvCellValue(deal.dealType),
    buyerSector: csvCellValue(deal.buyerSector),
    stage: csvCellValue(deal.stage),
    status: csvCellValue(deal.status),
    mainCategory: csvCellValue(deal.mainCategory),
    procurementMethod: csvCellValue(deal.procurementMethod),
    specialRegime: csvCellValue(deal.specialRegime),
    currency: csvCellValue(deal.currency),
    valueMinExVat: csvCellValue(deal.valueMinExVat),
    valueMaxExVat: csvCellValue(deal.valueMaxExVat),
    exactValueText: csvCellValue(deal.exactValueText),
    exactLocationText: csvCellValue(deal.exactLocationText),
    enquiryDeadline: csvCellValue(deal.enquiryDeadline),
    submissionDeadline: csvCellValue(deal.submissionDeadline),
    awardDecisionDate: csvCellValue(deal.awardDecisionDate),
    contractStartDate: csvCellValue(deal.contractStartDate),
    contractEndDate: csvCellValue(deal.contractEndDate),
    extensionEndDate: csvCellValue(deal.extensionEndDate),
    nextProcurementDate: csvCellValue(deal.nextProcurementDate),
    estimatedRenewalDate: csvCellValue(deal.estimatedRenewalDate),
    smeSuitable: csvCellValue(deal.smeSuitable),
    vcseSuitable: csvCellValue(deal.vcseSuitable),
    sourceUrl: csvCellValue(deal.sourceUrl),
    applicationUrl: csvCellValue(deal.applicationUrl),
    firstPublishedAt: csvCellValue(deal.firstPublishedAt),
    latestSourceAt: csvCellValue(deal.latestSourceAt),
    buyerName: csvCellValue(deal.buyer?.name),
    buyerWebsite: csvCellValue(deal.buyer?.website),
    buyerDomain: csvCellValue(deal.buyer?.domain),
    buyerEmail: csvCellValue(deal.buyer?.email),
    buyerPhone: csvCellValue(deal.buyer?.phone),
    buyerCity: csvCellValue(deal.buyer?.city),
    buyerRegion: csvCellValue(deal.buyer?.region),
    buyerCountryCode: csvCellValue(deal.buyer?.countryCode),
    contactName: csvCellValue(deal.procurementContact?.name),
    contactEmail: csvCellValue(deal.procurementContact?.email),
    contactPhone: csvCellValue(deal.procurementContact?.phone),
    sourceName: csvCellValue(deal.source?.name),
    sourceKey: csvCellValue(deal.source?.sourceKey),
    sourceType: csvCellValue(deal.source?.sourceType),
    sourceBaseUrl: csvCellValue(deal.source?.baseUrl),
  };
}

export function exportRowCells(row: DealExportRow): string[] {
  return DEAL_EXPORT_COLUMNS.map((column) => row[column.key]);
}

export function assertDealExportRow(value: unknown): DealExportRow {
  if (!value || typeof value !== "object") {
    throw new Error("Export row must be an object");
  }
  const record = value as Record<string, unknown>;
  for (const key of EXPORT_INTERNAL_KEYS) {
    if (key in record) {
      throw new Error(`Export row contains internal key ${key}`);
    }
  }
  for (const column of DEAL_EXPORT_COLUMNS) {
    if (typeof record[column.key] !== "string") {
      throw new Error(`Export row missing ${column.key}`);
    }
  }
  return value as DealExportRow;
}

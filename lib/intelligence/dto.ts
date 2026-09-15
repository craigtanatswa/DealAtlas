import type {
  BuyerIntelligenceDto,
  ContractListDto,
  DealHistoryDto,
  OrganizationListDto,
  RenewalListDto,
  SupplierIntelligenceDto,
} from "@/lib/intelligence/types";

const OMITTED_INTERNAL_KEYS = [
  "data_quality_score",
  "source_count",
  "extracted_text",
  "protected_payload",
  "dodo_customer_id",
  "dodo_subscription_id",
  "dodo_product_id",
  "raw_payload",
  "previous_value",
  "new_value",
] as const;

function assertNoInternalKeys(value: unknown, label: string) {
  if (!value || typeof value !== "object") {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  for (const key of OMITTED_INTERNAL_KEYS) {
    if (key in record) {
      throw new Error(`${label} contains internal key ${key}`);
    }
  }
}

export function assertBuyerIntelligenceDto(value: unknown): BuyerIntelligenceDto {
  assertNoInternalKeys(value, "Buyer intelligence DTO");
  return value as BuyerIntelligenceDto;
}

export function assertSupplierIntelligenceDto(value: unknown): SupplierIntelligenceDto {
  assertNoInternalKeys(value, "Supplier intelligence DTO");
  return value as SupplierIntelligenceDto;
}

export function assertOrganizationListDto(value: unknown): OrganizationListDto {
  assertNoInternalKeys(value, "Organisation list DTO");
  return value as OrganizationListDto;
}

export function assertContractListDto(value: unknown): ContractListDto {
  assertNoInternalKeys(value, "Contract list DTO");
  return value as ContractListDto;
}

export function assertRenewalListDto(value: unknown): RenewalListDto {
  assertNoInternalKeys(value, "Renewal list DTO");
  return value as RenewalListDto;
}

export function assertDealHistoryDto(value: unknown): DealHistoryDto {
  assertNoInternalKeys(value, "Deal history DTO");
  return value as DealHistoryDto;
}

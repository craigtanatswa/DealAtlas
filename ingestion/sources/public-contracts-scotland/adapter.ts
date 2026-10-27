import type { SourceAdapter } from "@/ingestion/core/types";
import {
  createMonthlyOcdsAdapter,
  type MonthlyOcdsAdapterOptions,
} from "@/ingestion/sources/ocds-monthly/adapter";
import { PUBLIC_CONTRACTS_SCOTLAND_MONTHLY_SOURCE } from "@/ingestion/sources/public-contracts-scotland/constants";

export function createPublicContractsScotlandAdapter(
  options: MonthlyOcdsAdapterOptions = {},
): SourceAdapter {
  return createMonthlyOcdsAdapter(PUBLIC_CONTRACTS_SCOTLAND_MONTHLY_SOURCE, options);
}

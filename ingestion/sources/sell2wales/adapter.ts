import type { SourceAdapter } from "@/ingestion/core/types";
import {
  createMonthlyOcdsAdapter,
  type MonthlyOcdsAdapterOptions,
} from "@/ingestion/sources/ocds-monthly/adapter";
import { SELL2WALES_MONTHLY_SOURCE } from "@/ingestion/sources/sell2wales/constants";

export function createSell2WalesAdapter(
  options: MonthlyOcdsAdapterOptions = {},
): SourceAdapter {
  return createMonthlyOcdsAdapter(SELL2WALES_MONTHLY_SOURCE, options);
}

import type { SourceAdapter } from "@/ingestion/core/types";
import { createAllowlistedJsonClient } from "@/ingestion/core/http";
import { createPublicContractsScotlandFetch } from "@/ingestion/core/tls";
import {
  createMonthlyOcdsAdapter,
  type MonthlyOcdsAdapterOptions,
} from "@/ingestion/sources/ocds-monthly/adapter";
import {
  PUBLIC_CONTRACTS_SCOTLAND_FETCH_POLICY,
  PUBLIC_CONTRACTS_SCOTLAND_MONTHLY_SOURCE,
} from "@/ingestion/sources/public-contracts-scotland/constants";

export function createPublicContractsScotlandAdapter(
  options: MonthlyOcdsAdapterOptions = {},
): SourceAdapter {
  const http =
    options.http ??
    createAllowlistedJsonClient(PUBLIC_CONTRACTS_SCOTLAND_FETCH_POLICY, {
      fetchImpl: createPublicContractsScotlandFetch(),
    });
  return createMonthlyOcdsAdapter(PUBLIC_CONTRACTS_SCOTLAND_MONTHLY_SOURCE, {
    ...options,
    http,
  });
}

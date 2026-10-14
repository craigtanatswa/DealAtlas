import type { SourceAdapter } from "@/ingestion/core/types";
import { IngestionError } from "@/ingestion/core/errors";
import { createContractsFinderAdapter } from "@/ingestion/sources/contracts-finder/adapter";
import { CONTRACTS_FINDER_SOURCE_KEY } from "@/ingestion/sources/contracts-finder/constants";
import { createFindATenderAdapter } from "@/ingestion/sources/find-a-tender/adapter";
import { FIND_A_TENDER_SOURCE_KEY } from "@/ingestion/sources/find-a-tender/constants";
import { createPublicContractsScotlandAdapter } from "@/ingestion/sources/public-contracts-scotland/adapter";
import { PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY } from "@/ingestion/sources/public-contracts-scotland/constants";
import { createSell2WalesAdapter } from "@/ingestion/sources/sell2wales/adapter";
import { SELL2WALES_SOURCE_KEY } from "@/ingestion/sources/sell2wales/constants";
import { createUkInfrastructurePipelineAdapter } from "@/ingestion/sources/uk-infrastructure-pipeline/adapter";
import { UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY } from "@/ingestion/sources/uk-infrastructure-pipeline/constants";

const adapters = new Map<string, () => SourceAdapter>([
  [FIND_A_TENDER_SOURCE_KEY, () => createFindATenderAdapter()],
  [CONTRACTS_FINDER_SOURCE_KEY, () => createContractsFinderAdapter()],
  [PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY, () => createPublicContractsScotlandAdapter()],
  [SELL2WALES_SOURCE_KEY, () => createSell2WalesAdapter()],
  [
    UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY,
    () => createUkInfrastructurePipelineAdapter(),
  ],
]);

export function listRegisteredSourceKeys(): string[] {
  return [...adapters.keys()];
}

export function getSourceAdapter(sourceKey: string): SourceAdapter {
  const factory = adapters.get(sourceKey);
  if (!factory) {
    throw new IngestionError({
      message: `No adapter registered for source ${sourceKey}.`,
      stage: "discover",
      code: "ADAPTER_NOT_FOUND",
    });
  }
  return factory();
}

export function registerSourceAdapter(
  sourceKey: string,
  factory: () => SourceAdapter,
): void {
  adapters.set(sourceKey, factory);
}

export {
  CONTRACTS_FINDER_SOURCE_KEY,
  FIND_A_TENDER_SOURCE_KEY,
  PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY,
  SELL2WALES_SOURCE_KEY,
  UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY,
};

import type { SourceAdapter } from "@/ingestion/core/types";
import { IngestionError } from "@/ingestion/core/errors";
import { createContractsFinderAdapter } from "@/ingestion/sources/contracts-finder/adapter";
import { CONTRACTS_FINDER_SOURCE_KEY } from "@/ingestion/sources/contracts-finder/constants";
import { createFindATenderAdapter } from "@/ingestion/sources/find-a-tender/adapter";
import { FIND_A_TENDER_SOURCE_KEY } from "@/ingestion/sources/find-a-tender/constants";
import { createFindAGrantAdapter } from "@/ingestion/sources/find-a-grant/adapter";
import { FIND_A_GRANT_SOURCE_KEY } from "@/ingestion/sources/find-a-grant/constants";
import { createInnovateUkAdapter } from "@/ingestion/sources/innovate-uk/adapter";
import { INNOVATE_UK_SOURCE_KEY } from "@/ingestion/sources/innovate-uk/constants";
import { createUkInfrastructurePipelineAdapter } from "@/ingestion/sources/uk-infrastructure-pipeline/adapter";
import { UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY } from "@/ingestion/sources/uk-infrastructure-pipeline/constants";

const adapters = new Map<string, () => SourceAdapter>([
  [FIND_A_TENDER_SOURCE_KEY, () => createFindATenderAdapter()],
  [CONTRACTS_FINDER_SOURCE_KEY, () => createContractsFinderAdapter()],
  [
    UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY,
    () => createUkInfrastructurePipelineAdapter(),
  ],
  [FIND_A_GRANT_SOURCE_KEY, () => createFindAGrantAdapter()],
  [INNOVATE_UK_SOURCE_KEY, () => createInnovateUkAdapter()],
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
  FIND_A_GRANT_SOURCE_KEY,
  FIND_A_TENDER_SOURCE_KEY,
  INNOVATE_UK_SOURCE_KEY,
  UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY,
};

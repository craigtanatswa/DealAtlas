import type { SourceAdapter } from "@/ingestion/core/types";
import { IngestionError } from "@/ingestion/core/errors";
import { createFindATenderAdapter } from "@/ingestion/sources/find-a-tender/adapter";
import { FIND_A_TENDER_SOURCE_KEY } from "@/ingestion/sources/find-a-tender/constants";
import { createUkInfrastructurePipelineAdapter } from "@/ingestion/sources/uk-infrastructure-pipeline/adapter";
import { UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY } from "@/ingestion/sources/uk-infrastructure-pipeline/constants";

const adapters = new Map<string, () => SourceAdapter>([
  [FIND_A_TENDER_SOURCE_KEY, () => createFindATenderAdapter()],
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

export { FIND_A_TENDER_SOURCE_KEY, UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY };

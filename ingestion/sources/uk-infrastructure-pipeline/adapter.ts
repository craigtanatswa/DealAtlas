import type { SourceAdapter } from "@/ingestion/core/types";
import { createPrivateSourceAdapter } from "@/ingestion/sources/private/adapter";
import type { PrivateAdapterOptions } from "@/ingestion/sources/private/types";
import {
  NISTA_FETCH_POLICY,
  NISTA_LAYOUT_API,
  NISTA_PARSER_VERSION,
  NISTA_TIMEOUT_MS,
  UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY,
  nistaProjectUrl,
} from "@/ingestion/sources/uk-infrastructure-pipeline/constants";
import {
  extractNistaProjects,
  mapNistaRecord,
  nistaRecordId,
} from "@/ingestion/sources/uk-infrastructure-pipeline/parse";

export function createUkInfrastructurePipelineAdapter(
  options: PrivateAdapterOptions = {},
): SourceAdapter {
  return createPrivateSourceAdapter(
    {
      sourceKey: UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY,
      parserVersion: NISTA_PARSER_VERSION,
      format: "json",
      accessMethod: "JSON_API",
      fetchPolicy: NISTA_FETCH_POLICY,
      timeoutMs: NISTA_TIMEOUT_MS,
      discoverUrl: NISTA_LAYOUT_API,
      defaultDealType: "PROCUREMENT_PIPELINE",
      extractRecords: extractNistaProjects,
      recordId: nistaRecordId,
      sourceUrlFor: (_record, id) => nistaProjectUrl(id),
      mapRecord: mapNistaRecord,
    },
    options,
  );
}

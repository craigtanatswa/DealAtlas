import type { AllowedFetchPolicy, JsonHttpClient, TextHttpClient } from "@/ingestion/core/http";
import type { AccessMethod, CanonicalCandidate } from "@/ingestion/core/types";
import type { DealType } from "@/lib/search/filters";

export type PrivatePayloadFormat = "json" | "csv" | "html";

export type PrivateMappingContext = {
  sourceKey: string;
  sourceUrl: string;
  parserVersion: string;
  now: Date;
};

export type PrivateSourceDefinition = {
  sourceKey: string;
  parserVersion: string;
  format: PrivatePayloadFormat;
  accessMethod: AccessMethod;
  fetchPolicy: AllowedFetchPolicy;
  discoverUrl: string;
  timeoutMs?: number;
  defaultDealType: DealType;
  extractRecords: (payload: unknown, rawText?: string) => unknown[];
  recordId: (record: unknown) => string | null;
  sourceUrlFor: (record: unknown, id: string) => string;
  mapRecord: (
    record: unknown,
    context: PrivateMappingContext,
  ) => CanonicalCandidate;
};

export type PrivateAdapterOptions = {
  httpJson?: JsonHttpClient;
  httpText?: TextHttpClient;
  now?: () => Date;
};

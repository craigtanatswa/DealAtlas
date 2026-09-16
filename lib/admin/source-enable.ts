import {
  AUTOMATABLE_REUSE_STATUSES,
  canIngestSource,
  isScrapingAccessMethod,
  type AccessMethod,
  type ReuseStatus,
  type SourceComplianceInput,
} from "@/ingestion/core/compliance";
import { listRegisteredSourceKeys } from "@/ingestion/sources/registry";

export type SourceEnableInput = {
  sourceKey?: string;
  reuseStatus: ReuseStatus;
  accessMethod: AccessMethod;
  scrapingPermitted: boolean;
};

export function sourceEnableBlockReason(source: SourceEnableInput): string | null {
  if (
    !(AUTOMATABLE_REUSE_STATUSES as readonly string[]).includes(source.reuseStatus)
  ) {
    return `source cannot be enabled with reuse status ${source.reuseStatus}`;
  }

  if (isScrapingAccessMethod(source.accessMethod) && !source.scrapingPermitted) {
    return "HTML/PDF discovery source cannot be enabled until scraping_permitted=true";
  }

  if (
    source.sourceKey &&
    !listRegisteredSourceKeys().includes(source.sourceKey)
  ) {
    return `source cannot be enabled without a registered adapter (${source.sourceKey})`;
  }

  return null;
}

export function canEnableSource(source: SourceEnableInput): boolean {
  return sourceEnableBlockReason(source) === null;
}

export function ingestionReadiness(source: SourceComplianceInput) {
  return canIngestSource(source);
}

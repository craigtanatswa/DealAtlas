import { randomUUID } from "node:crypto";

import type { DataSourceRecord } from "@/ingestion/store/types";
import {
  PROCONTRACT_MAX_REQUESTS_PER_MINUTE,
  PROCONTRACT_ORIGIN,
  procontractPortal,
} from "@/ingestion/sources/procontract/constants";

const CHECKED_AT = "2026-10-14T00:00:00.000Z";

export function procontractSourceRecord(
  sourceKey: string,
  overrides: Partial<DataSourceRecord> = {},
): DataSourceRecord {
  const portal = procontractPortal(sourceKey);
  if (!portal) {
    throw new Error(`Unknown ProContract portal ${sourceKey}`);
  }
  return {
    id: overrides.id ?? randomUUID(),
    sourceKey: portal.sourceKey,
    name: portal.name,
    sourceType: "PROCUREMENT_PLATFORM",
    accessMethod: "HTML",
    baseUrl: portal.listingUrl ?? `${PROCONTRACT_ORIGIN}/`,
    apiUrl: portal.rssUrl,
    termsUrl: portal.termsUrl,
    licenceName: null,
    licenceUrl: null,
    reuseStatus: portal.reuseStatus,
    scrapingPermitted: false,
    enabled: false,
    scheduleExpression: null,
    rateLimitPerMinute: PROCONTRACT_MAX_REQUESTS_PER_MINUTE,
    robotsCheckedAt: CHECKED_AT,
    termsCheckedAt: CHECKED_AT,
    complianceNotes:
      "Represented only. No reuse licence is documented, scraping is not permitted, and live fetch is disabled. See docs/SOURCE_COMPLIANCE_REPORT.md.",
    lastSuccessAt: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

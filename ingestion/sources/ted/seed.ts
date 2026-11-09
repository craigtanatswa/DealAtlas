import { randomUUID } from "node:crypto";

import type { DataSourceRecord } from "@/ingestion/store/types";
import {
  TED_FAIR_USE_URL,
  TED_LICENCE_NAME,
  TED_LICENCE_URL,
  TED_ORIGIN,
  TED_SEARCH_API,
  TED_SOURCE_KEY,
} from "@/ingestion/sources/ted/constants";

export function tedSourceRecord(
  overrides: Partial<DataSourceRecord> = {},
): DataSourceRecord {
  return {
    id: overrides.id ?? randomUUID(),
    sourceKey: TED_SOURCE_KEY,
    name: "Tenders Electronic Daily",
    sourceType: "GOVERNMENT_OPEN_DATA",
    accessMethod: "JSON_API",
    baseUrl: `${TED_ORIGIN}/`,
    apiUrl: TED_SEARCH_API,
    termsUrl: TED_FAIR_USE_URL,
    licenceName: TED_LICENCE_NAME,
    licenceUrl: TED_LICENCE_URL,
    reuseStatus: "OPEN_LICENSE",
    scrapingPermitted: false,
    enabled: true,
    scheduleExpression: null,
    rateLimitPerMinute: 10,
    robotsCheckedAt: null,
    termsCheckedAt: "2026-10-14T00:00:00.000Z",
    complianceNotes:
      "Official TED Search API v3 only. No API key. Do not scrape HTML and do not download notice XML or PDF. Preserve-only: ingestion must not publish previews. The production row stays disabled until it is turned on.",
    lastSuccessAt: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

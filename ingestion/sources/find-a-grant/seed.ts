import { randomUUID } from "node:crypto";

import type { DataSourceRecord } from "@/ingestion/store/types";
import {
  FIND_A_GRANT_LICENCE_NAME,
  FIND_A_GRANT_LICENCE_URL,
  FIND_A_GRANT_LIST_URL,
  FIND_A_GRANT_ORIGIN,
  FIND_A_GRANT_SOURCE_KEY,
  FIND_A_GRANT_TERMS_URL,
} from "@/ingestion/sources/find-a-grant/constants";

export function findAGrantSourceRecord(
  overrides: Partial<DataSourceRecord> = {},
): DataSourceRecord {
  return {
    id: overrides.id ?? randomUUID(),
    sourceKey: FIND_A_GRANT_SOURCE_KEY,
    name: "Find a Grant",
    sourceType: "GOVERNMENT_WEB",
    accessMethod: "HTML",
    baseUrl: `${FIND_A_GRANT_ORIGIN}/`,
    apiUrl: FIND_A_GRANT_LIST_URL,
    termsUrl: FIND_A_GRANT_TERMS_URL,
    licenceName: FIND_A_GRANT_LICENCE_NAME,
    licenceUrl: FIND_A_GRANT_LICENCE_URL,
    reuseStatus: "OPEN_LICENSE",
    scrapingPermitted: false,
    enabled: false,
    scheduleExpression: "0 6 * * *",
    rateLimitPerMinute: 10,
    robotsCheckedAt: "2026-10-14T00:00:00.000Z",
    termsCheckedAt: "2026-10-14T00:00:00.000Z",
    complianceNotes:
      "Public Find a Grant pages under the Open Government Licence v3.0. No Disallow in robots.txt (HTTP 404). Terms do not explicitly allow scraping, so scraping_permitted stays false and the source stays disabled. Preserve-only.",
    lastSuccessAt: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

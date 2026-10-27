import { randomUUID } from "node:crypto";

import type { DataSourceRecord } from "@/ingestion/store/types";
import {
  INNOVATE_UK_LICENCE_NAME,
  INNOVATE_UK_LICENCE_URL,
  INNOVATE_UK_ORIGIN,
  INNOVATE_UK_SEARCH_URL,
  INNOVATE_UK_SOURCE_KEY,
  INNOVATE_UK_TERMS_URL,
} from "@/ingestion/sources/innovate-uk/constants";

export function innovateUkSourceRecord(
  overrides: Partial<DataSourceRecord> = {},
): DataSourceRecord {
  return {
    id: overrides.id ?? randomUUID(),
    sourceKey: INNOVATE_UK_SOURCE_KEY,
    name: "Innovate UK funding competitions",
    sourceType: "GOVERNMENT_WEB",
    accessMethod: "HTML",
    baseUrl: `${INNOVATE_UK_ORIGIN}/`,
    apiUrl: INNOVATE_UK_SEARCH_URL,
    termsUrl: INNOVATE_UK_TERMS_URL,
    licenceName: INNOVATE_UK_LICENCE_NAME,
    licenceUrl: INNOVATE_UK_LICENCE_URL,
    reuseStatus: "OPEN_LICENSE",
    scrapingPermitted: false,
    enabled: false,
    scheduleExpression: "0 6 * * *",
    rateLimitPerMinute: 10,
    robotsCheckedAt: "2026-10-14T00:00:00.000Z",
    termsCheckedAt: "2026-10-14T00:00:00.000Z",
    complianceNotes:
      "Public Innovation Funding Service competition search under the Open Government Licence v3.0. robots.txt redirects to login, which the adapter treats as disallow-all. Terms do not explicitly allow scraping, so scraping_permitted stays false and the source stays disabled. Preserve-only.",
    lastSuccessAt: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

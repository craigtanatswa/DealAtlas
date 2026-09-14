import { randomUUID } from "node:crypto";

import type { DataSourceRecord } from "@/ingestion/store/types";
import {
  FIND_A_TENDER_DOCS_URL,
  FIND_A_TENDER_LICENCE_NAME,
  FIND_A_TENDER_LICENCE_URL,
  FIND_A_TENDER_ORIGIN,
  FIND_A_TENDER_RELEASE_API,
  FIND_A_TENDER_SOURCE_KEY,
} from "@/ingestion/sources/find-a-tender/constants";

export function findATenderSourceRecord(
  overrides: Partial<DataSourceRecord> = {},
): DataSourceRecord {
  return {
    id: overrides.id ?? randomUUID(),
    sourceKey: FIND_A_TENDER_SOURCE_KEY,
    name: "Find a Tender",
    sourceType: "GOVERNMENT_OPEN_DATA",
    accessMethod: "OCDS_API",
    baseUrl: FIND_A_TENDER_ORIGIN + "/",
    apiUrl: FIND_A_TENDER_RELEASE_API,
    termsUrl: FIND_A_TENDER_DOCS_URL,
    licenceName: FIND_A_TENDER_LICENCE_NAME,
    licenceUrl: FIND_A_TENDER_LICENCE_URL,
    reuseStatus: "OPEN_LICENSE",
    scrapingPermitted: false,
    enabled: true,
    scheduleExpression: "0 */6 * * *",
    rateLimitPerMinute: 20,
    robotsCheckedAt: null,
    termsCheckedAt: "2026-09-14T00:00:00.000Z",
    complianceNotes:
      "Official OCDS release-package API. Open Government Licence v3.0. Do not scrape HTML.",
    lastSuccessAt: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

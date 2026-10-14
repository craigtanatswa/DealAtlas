import { randomUUID } from "node:crypto";

import type { DataSourceRecord } from "@/ingestion/store/types";
import {
  CONTRACTS_FINDER_LICENCE_NAME,
  CONTRACTS_FINDER_LICENCE_URL,
  CONTRACTS_FINDER_ORIGIN,
  CONTRACTS_FINDER_SEARCH_API,
  CONTRACTS_FINDER_SOURCE_KEY,
} from "@/ingestion/sources/contracts-finder/constants";

export function contractsFinderSourceRecord(
  overrides: Partial<DataSourceRecord> = {},
): DataSourceRecord {
  return {
    id: overrides.id ?? randomUUID(),
    sourceKey: CONTRACTS_FINDER_SOURCE_KEY,
    name: "Contracts Finder",
    sourceType: "GOVERNMENT_OPEN_DATA",
    accessMethod: "OCDS_API",
    baseUrl: CONTRACTS_FINDER_ORIGIN + "/",
    apiUrl: CONTRACTS_FINDER_SEARCH_API,
    termsUrl: CONTRACTS_FINDER_LICENCE_URL,
    licenceName: CONTRACTS_FINDER_LICENCE_NAME,
    licenceUrl: CONTRACTS_FINDER_LICENCE_URL,
    reuseStatus: "OPEN_LICENSE",
    scrapingPermitted: false,
    enabled: true,
    scheduleExpression: "0 */6 * * *",
    rateLimitPerMinute: 10,
    robotsCheckedAt: null,
    termsCheckedAt: "2026-10-12T00:00:00.000Z",
    complianceNotes:
      "Official OCDS Search feed only, approved under the Open Government Licence v3.0. Do not scrape HTML. Preserve-only: ingestion must not publish previews.",
    lastSuccessAt: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

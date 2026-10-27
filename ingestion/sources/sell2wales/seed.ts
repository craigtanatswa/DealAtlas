import { randomUUID } from "node:crypto";

import type { DataSourceRecord } from "@/ingestion/store/types";
import {
  SELL2WALES_LICENCE_NAME,
  SELL2WALES_LICENCE_URL,
  SELL2WALES_NOTICES_API,
  SELL2WALES_SOURCE_KEY,
  SELL2WALES_TERMS_URL,
} from "@/ingestion/sources/sell2wales/constants";

export function sell2WalesSourceRecord(
  overrides: Partial<DataSourceRecord> = {},
): DataSourceRecord {
  return {
    id: overrides.id ?? randomUUID(),
    sourceKey: SELL2WALES_SOURCE_KEY,
    name: "Sell2Wales",
    sourceType: "GOVERNMENT_OPEN_DATA",
    accessMethod: "OCDS_API",
    baseUrl: "https://www.sell2wales.gov.wales/",
    apiUrl: SELL2WALES_NOTICES_API,
    termsUrl: SELL2WALES_TERMS_URL,
    licenceName: SELL2WALES_LICENCE_NAME,
    licenceUrl: SELL2WALES_LICENCE_URL,
    reuseStatus: "OPEN_LICENSE",
    scrapingPermitted: false,
    enabled: false,
    scheduleExpression: "0 */6 * * *",
    rateLimitPerMinute: 10,
    robotsCheckedAt: "2026-10-14T00:00:00.000Z",
    termsCheckedAt: "2026-10-14T00:00:00.000Z",
    complianceNotes:
      "Official OCDS API only, under the Open Government Licence v3.0. Do not scrape HTML and do not use the RSS feed. Disabled until an operator enables the row. Preserve-only ingestion. At most 10 requests per minute.",
    lastSuccessAt: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

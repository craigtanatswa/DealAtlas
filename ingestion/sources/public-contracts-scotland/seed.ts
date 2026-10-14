import { randomUUID } from "node:crypto";

import type { DataSourceRecord } from "@/ingestion/store/types";
import {
  PUBLIC_CONTRACTS_SCOTLAND_LICENCE_NAME,
  PUBLIC_CONTRACTS_SCOTLAND_LICENCE_URL,
  PUBLIC_CONTRACTS_SCOTLAND_NOTICES_API,
  PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY,
  PUBLIC_CONTRACTS_SCOTLAND_TERMS_URL,
} from "@/ingestion/sources/public-contracts-scotland/constants";

export function publicContractsScotlandSourceRecord(
  overrides: Partial<DataSourceRecord> = {},
): DataSourceRecord {
  return {
    id: overrides.id ?? randomUUID(),
    sourceKey: PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY,
    name: "Public Contracts Scotland",
    sourceType: "GOVERNMENT_OPEN_DATA",
    accessMethod: "OCDS_API",
    baseUrl: "https://www.publiccontractsscotland.gov.uk/",
    apiUrl: PUBLIC_CONTRACTS_SCOTLAND_NOTICES_API,
    termsUrl: PUBLIC_CONTRACTS_SCOTLAND_TERMS_URL,
    licenceName: PUBLIC_CONTRACTS_SCOTLAND_LICENCE_NAME,
    licenceUrl: PUBLIC_CONTRACTS_SCOTLAND_LICENCE_URL,
    reuseStatus: "OPEN_LICENSE",
    scrapingPermitted: false,
    enabled: false,
    scheduleExpression: "0 */6 * * *",
    rateLimitPerMinute: 10,
    robotsCheckedAt: "2026-10-14T00:00:00.000Z",
    termsCheckedAt: "2026-10-14T00:00:00.000Z",
    complianceNotes:
      "Official OCDS API only, under the Open Government Licence v3.0, including Quick Quote awards (notice type 104). Quick Quote invitations are not public. Do not scrape HTML. Disabled until an operator enables the row. Preserve-only ingestion. At most 10 requests per minute.",
    lastSuccessAt: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

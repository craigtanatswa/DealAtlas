import { randomUUID } from "node:crypto";

import type { DataSourceRecord } from "@/ingestion/store/types";
import {
  NISTA_LAYOUT_API,
  NISTA_LICENCE_NAME,
  NISTA_LICENCE_URL,
  NISTA_ORIGIN,
  NISTA_PUBLICATION_URL,
  NISTA_TERMS_URL,
  UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY,
} from "@/ingestion/sources/uk-infrastructure-pipeline/constants";

export function ukInfrastructurePipelineSourceRecord(
  overrides: Partial<DataSourceRecord> = {},
): DataSourceRecord {
  return {
    id: overrides.id ?? randomUUID(),
    sourceKey: UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY,
    name: "UK Infrastructure Pipeline",
    sourceType: "GOVERNMENT_OPEN_DATA",
    accessMethod: "JSON_API",
    baseUrl: `${NISTA_ORIGIN}/`,
    apiUrl: NISTA_LAYOUT_API,
    termsUrl: NISTA_TERMS_URL,
    licenceName: NISTA_LICENCE_NAME,
    licenceUrl: NISTA_LICENCE_URL,
    reuseStatus: "OPEN_LICENSE",
    scrapingPermitted: false,
    enabled: true,
    scheduleExpression: "0 6 * * *",
    rateLimitPerMinute: 6,
    robotsCheckedAt: "2026-09-14T00:00:00.000Z",
    termsCheckedAt: "2026-09-14T00:00:00.000Z",
    complianceNotes: `Official NISTA/GOV.UK infrastructure pipeline of public and privately delivered projects. ${NISTA_PUBLICATION_URL} All data is downloadable; ingestion uses the dashboard JSON layout payload under OGL v3.0. Do not scrape HTML.`,
    lastSuccessAt: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

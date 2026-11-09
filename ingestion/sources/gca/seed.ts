import { randomUUID } from "node:crypto";

import type { DataSourceRecord } from "@/ingestion/store/types";
import {
  GCA_AGREEMENTS_API,
  GCA_AGREEMENTS_SOURCE_KEY,
  GCA_LICENCE_NAME,
  GCA_LICENCE_URL,
  GCA_ORIGIN,
  GCA_PIPELINE_FILE,
  GCA_PIPELINE_SOURCE_KEY,
  GCA_ROBOTS_URL,
  GCA_TERMS_URL,
} from "@/ingestion/sources/gca/constants";

const CHECKED = "2026-10-14T00:00:00.000Z";

export function gcaAgreementsSourceRecord(
  overrides: Partial<DataSourceRecord> = {},
): DataSourceRecord {
  return {
    id: overrides.id ?? randomUUID(),
    sourceKey: GCA_AGREEMENTS_SOURCE_KEY,
    name: "Government Commercial Agency agreements",
    sourceType: "GOVERNMENT_OPEN_DATA",
    accessMethod: "JSON_API",
    baseUrl: `${GCA_ORIGIN}/`,
    apiUrl: GCA_AGREEMENTS_API,
    termsUrl: GCA_TERMS_URL,
    licenceName: GCA_LICENCE_NAME,
    licenceUrl: GCA_LICENCE_URL,
    reuseStatus: "OPEN_LICENSE",
    scrapingPermitted: false,
    enabled: false,
    scheduleExpression: null,
    rateLimitPerMinute: 6,
    robotsCheckedAt: CHECKED,
    termsCheckedAt: CHECKED,
    complianceNotes: `Crown Commercial Service became the Government Commercial Agency on 1 April 2026. Official JSON feed ${GCA_AGREEMENTS_API} with no query string. robots.txt at ${GCA_ROBOTS_URL} disallows page, limit, status and search queries, so further pages are not requested. OGL v3.0. Disabled until explicitly enabled. Preserve-only.`,
    lastSuccessAt: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

export function gcaPipelineSourceRecord(
  overrides: Partial<DataSourceRecord> = {},
): DataSourceRecord {
  return {
    id: overrides.id ?? randomUUID(),
    sourceKey: GCA_PIPELINE_SOURCE_KEY,
    name: "Government Commercial Agency pipeline",
    sourceType: "GOVERNMENT_OPEN_DATA",
    accessMethod: "CSV",
    baseUrl: `${GCA_ORIGIN}/agreements/upcoming`,
    apiUrl: GCA_PIPELINE_FILE,
    termsUrl: GCA_TERMS_URL,
    licenceName: GCA_LICENCE_NAME,
    licenceUrl: GCA_LICENCE_URL,
    reuseStatus: "OPEN_LICENSE",
    scrapingPermitted: false,
    enabled: false,
    scheduleExpression: null,
    rateLimitPerMinute: 6,
    robotsCheckedAt: CHECKED,
    termsCheckedAt: CHECKED,
    complianceNotes: `Official ODS download linked from the upcoming-agreements page. File is OpenDocument, recorded as CSV because that is the tabular access method. OGL v3.0. One request. Disabled until explicitly enabled. Preserve-only.`,
    lastSuccessAt: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

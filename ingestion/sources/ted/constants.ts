import type { AllowedFetchPolicy } from "@/ingestion/core/http";

export const TED_SOURCE_KEY = "ted";

export const TED_HOST = "api.ted.europa.eu";

export const TED_ORIGIN = "https://ted.europa.eu";

/** Official Search API. Notice HTML, XML and PDF URLs are stored, never fetched. */
export const TED_SEARCH_API = `https://${TED_HOST}/v3/notices/search`;

export const TED_LICENCE_NAME = "Commission Decision 2011/833/EU";

export const TED_LICENCE_URL = "https://ted.europa.eu/en/legal-notice";

export const TED_FAIR_USE_URL = "https://ted.europa.eu/en/news/fair-usage-policy-on-ted";

export const TED_PARSER_VERSION = "ted-search-v3@1";

/**
 * Published fair-use cap is 700 HTTP requests in a minute. Ten requests per
 * minute stays far under that cap. Search JSON only: notice downloads count
 * against a separate 600-visualisations / 6-minute limit, so those URLs are
 * not fetched.
 */
export const TED_REQUEST_LIMIT = 10;
export const TED_REQUEST_WINDOW_MS = 60_000;

export const TED_FETCH_POLICY: AllowedFetchPolicy = {
  protocol: "https:",
  hosts: [TED_HOST],
  pathPrefixes: ["/v3/notices/search"],
};

/**
 * Expert-search fields that keep a notice in the UK-SME set.
 * `publication-date` is the ingest window, not an eligibility rule.
 *
 * - notice-type: competition notices (contract notice, PIN used as a call
 *   for competition, design contest). Award and modification types are out.
 * - procedure-type: procedures with a public call. `neg-wo-call` is out.
 *   Design contests are included via notice-type even when procedure-type
 *   is absent.
 * - submission-language: ENG, so a UK SME can submit in English.
 * - deadline-receipt-request: receipt of tenders, requests to participate,
 *   or expressions of interest. The query uses today (UTC); each row is
 *   dropped unless that instant is still in the future.
 * - place-of-performance: EU-27 ISO 3166-1 alpha-3, plus `anyw-eea`
 *   (anywhere in the EEA). UK suppliers can bid for this covered
 *   procurement under the EU-UK Trade and Cooperation Agreement. UK
 *   notices stay on Find a Tender, so GBR is not in the list.
 */
export const TED_ELIGIBILITY_FIELDS = [
  "notice-type",
  "procedure-type",
  "submission-language",
  "deadline-receipt-request",
  "place-of-performance",
] as const;

export const TED_WINDOW_FIELD = "publication-date";

export const TED_COMPETITION_NOTICE_TYPES = [
  "cn-standard",
  "cn-social",
  "pin-cfc-standard",
  "pin-cfc-social",
  "cn-desg",
] as const;

export const TED_OPEN_PROCEDURE_TYPES = [
  "open",
  "restricted",
  "neg-w-call",
  "comp-dial",
  "innovation",
] as const;

/** EU-27 plus the TED code for "anywhere in the EEA". */
export const TED_UK_SME_PLACES = [
  "AUT",
  "BEL",
  "BGR",
  "HRV",
  "CYP",
  "CZE",
  "DNK",
  "EST",
  "FIN",
  "FRA",
  "DEU",
  "GRC",
  "HUN",
  "IRL",
  "ITA",
  "LVA",
  "LTU",
  "LUX",
  "MLT",
  "NLD",
  "POL",
  "PRT",
  "ROU",
  "SVK",
  "SVN",
  "ESP",
  "SWE",
  "anyw-eea",
] as const;

export const TED_SEARCH_FIELDS = [
  "publication-number",
  "publication-date",
  "notice-title",
  "notice-type",
  "procedure-type",
  "buyer-name",
  "buyer-country",
  "buyer-city",
  "buyer-internet-address",
  "classification-cpv",
  "deadline-receipt-request",
  "place-of-performance",
  "submission-language",
  "description-proc",
  "description-lot",
  "estimated-value-proc",
  "estimated-value-cur-proc",
  "estimated-value-lot",
  "estimated-value-cur-lot",
  "organisation-email-buyer",
  "organisation-tel-buyer",
  "document-url-lot",
  "internal-identifier-proc",
  "framework-agreement-lot",
  "contract-duration-start-date-lot",
  "contract-duration-end-date-lot",
  "links",
] as const;

export function tedNoticeUrl(publicationNumber: string): string {
  return `${TED_ORIGIN}/en/notice/-/detail/${encodeURIComponent(publicationNumber)}`;
}

export function formatTedDate(value: Date): string {
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}`;
}

/** `2026-10-07T12:00:00` from the open-ingest window becomes `20261007`. */
export function tedDateFromOcds(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[1]}${match[2]}${match[3]}` : null;
}

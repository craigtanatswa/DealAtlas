import type { MonthlyOcdsSource } from "@/ingestion/sources/ocds-monthly/adapter";

export const SELL2WALES_SOURCE_KEY = "sell2wales";

export const SELL2WALES_HOST = "api.sell2wales.gov.wales";

export const SELL2WALES_ORIGIN = `https://${SELL2WALES_HOST}`;

export const SELL2WALES_NOTICES_API = `${SELL2WALES_ORIGIN}/v1/Notices`;

export const SELL2WALES_LICENCE_NAME = "Open Government Licence v3.0";

export const SELL2WALES_LICENCE_URL =
  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

export const SELL2WALES_TERMS_URL =
  "https://www.sell2wales.gov.wales/helpandresources/ocds/publicationpolicy";

export const SELL2WALES_PARSER_VERSION = "sell2wales-ocds@1";

/** English locale. Welsh (1106) is the same notices and is not requested twice. */
export const SELL2WALES_LOCALE = "2057";

/** Invitations to tender, F2 contract notices, and utilities F5. */
export const SELL2WALES_TENDER_TYPES = [51, 2, 5] as const;

export const SELL2WALES_FETCH_POLICY = {
  protocol: "https:" as const,
  hosts: [SELL2WALES_HOST],
  pathPrefixes: ["/v1/"],
};

export function sell2WalesNoticeUrl(ocid: string): string {
  const url = new URL("/v1/Notice", SELL2WALES_ORIGIN);
  url.searchParams.set("id", ocid);
  url.searchParams.set("locale", SELL2WALES_LOCALE);
  return url.toString();
}

export const SELL2WALES_MONTHLY_SOURCE: MonthlyOcdsSource = {
  sourceKey: SELL2WALES_SOURCE_KEY,
  origin: SELL2WALES_ORIGIN,
  fetchPolicy: SELL2WALES_FETCH_POLICY,
  noticeTypes: SELL2WALES_TENDER_TYPES,
  locale: SELL2WALES_LOCALE,
  parserVersion: SELL2WALES_PARSER_VERSION,
  noticeUrl: sell2WalesNoticeUrl,
};

import type { MonthlyOcdsSource } from "@/ingestion/sources/ocds-monthly/adapter";

export const PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY = "public-contracts-scotland";

export const PUBLIC_CONTRACTS_SCOTLAND_HOST = "api.publiccontractsscotland.gov.uk";

export const PUBLIC_CONTRACTS_SCOTLAND_ORIGIN = `https://${PUBLIC_CONTRACTS_SCOTLAND_HOST}`;

export const PUBLIC_CONTRACTS_SCOTLAND_NOTICES_API =
  `${PUBLIC_CONTRACTS_SCOTLAND_ORIGIN}/v1/Notices`;

export const PUBLIC_CONTRACTS_SCOTLAND_LICENCE_NAME = "Open Government Licence v3.0";

export const PUBLIC_CONTRACTS_SCOTLAND_LICENCE_URL =
  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

export const PUBLIC_CONTRACTS_SCOTLAND_TERMS_URL =
  "https://www.publiccontractsscotland.gov.uk/sitehelp/help_terms.aspx";

export const PUBLIC_CONTRACTS_SCOTLAND_PARSER_VERSION = "public-contracts-scotland-ocds@1";

/**
 * Site contract notices, F2, utilities F5, and published Quick Quote awards.
 * Quick Quote invitations are not on the public API. Type 104 is the award.
 */
export const PUBLIC_CONTRACTS_SCOTLAND_QUICK_QUOTE_AWARD_TYPE = 104;

export const PUBLIC_CONTRACTS_SCOTLAND_NOTICE_TYPES = [
  102,
  2,
  5,
  PUBLIC_CONTRACTS_SCOTLAND_QUICK_QUOTE_AWARD_TYPE,
] as const;

export const PUBLIC_CONTRACTS_SCOTLAND_FETCH_POLICY = {
  protocol: "https:" as const,
  hosts: [PUBLIC_CONTRACTS_SCOTLAND_HOST],
  pathPrefixes: ["/v1/"],
};

export function publicContractsScotlandNoticeUrl(ocid: string): string {
  const url = new URL("/v1/Notice", PUBLIC_CONTRACTS_SCOTLAND_ORIGIN);
  url.searchParams.set("id", ocid);
  return url.toString();
}

export const PUBLIC_CONTRACTS_SCOTLAND_MONTHLY_SOURCE: MonthlyOcdsSource = {
  sourceKey: PUBLIC_CONTRACTS_SCOTLAND_SOURCE_KEY,
  origin: PUBLIC_CONTRACTS_SCOTLAND_ORIGIN,
  fetchPolicy: PUBLIC_CONTRACTS_SCOTLAND_FETCH_POLICY,
  noticeTypes: PUBLIC_CONTRACTS_SCOTLAND_NOTICE_TYPES,
  parserVersion: PUBLIC_CONTRACTS_SCOTLAND_PARSER_VERSION,
  noticeUrl: publicContractsScotlandNoticeUrl,
};

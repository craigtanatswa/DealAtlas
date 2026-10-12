export const CONTRACTS_FINDER_SOURCE_KEY = "contracts-finder";

export const CONTRACTS_FINDER_HOST = "www.contractsfinder.service.gov.uk";

export const CONTRACTS_FINDER_ORIGIN = `https://${CONTRACTS_FINDER_HOST}`;

/** Official OCDS Search feed. HTML notice pages are not fetched. */
export const CONTRACTS_FINDER_SEARCH_API =
  `${CONTRACTS_FINDER_ORIGIN}/Published/Notices/OCDS/Search`;

export const CONTRACTS_FINDER_LICENCE_NAME = "Open Government Licence v3.0";

export const CONTRACTS_FINDER_LICENCE_URL =
  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

export const CONTRACTS_FINDER_PARSER_VERSION = "contracts-finder-ocds-search@1";

/** Find a Tender OCDS prefix. Used only as a cross-source identity key. */
export const FIND_A_TENDER_OCID_PREFIX = "ocds-h6vhtk-";

export const CONTRACTS_FINDER_FETCH_POLICY = {
  protocol: "https:" as const,
  hosts: [CONTRACTS_FINDER_HOST],
  pathPrefixes: ["/Published/Notices/OCDS/"],
};

export function contractsFinderNoticeUrl(noticeId: string): string {
  return `${CONTRACTS_FINDER_ORIGIN}/Notice/${encodeURIComponent(noticeId)}`;
}

export function formatOcdsDateTime(value: Date): string {
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
}

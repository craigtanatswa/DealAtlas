export const FIND_A_TENDER_SOURCE_KEY = "find-a-tender";

export const FIND_A_TENDER_HOST = "www.find-tender.service.gov.uk";

export const FIND_A_TENDER_ORIGIN = `https://${FIND_A_TENDER_HOST}`;

export const FIND_A_TENDER_RELEASE_API =
  `${FIND_A_TENDER_ORIGIN}/api/1.0/ocdsReleasePackages`;

export const FIND_A_TENDER_RECORD_API =
  `${FIND_A_TENDER_ORIGIN}/api/1.0/ocdsRecordPackages`;

export const FIND_A_TENDER_DOCS_URL =
  `${FIND_A_TENDER_ORIGIN}/Developer/Documentation`;

export const FIND_A_TENDER_LICENCE_NAME = "Open Government Licence v3.0";

export const FIND_A_TENDER_LICENCE_URL =
  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

export const FIND_A_TENDER_PARSER_VERSION = "find-a-tender-ocds-1.1.5@1";

export const FIND_A_TENDER_FETCH_POLICY = {
  protocol: "https:" as const,
  hosts: [FIND_A_TENDER_HOST],
  pathPrefixes: ["/api/1.0/ocdsReleasePackages", "/api/1.0/ocdsRecordPackages"],
};

export function findATenderNoticeUrl(noticeId: string): string {
  return `${FIND_A_TENDER_ORIGIN}/Notice/${encodeURIComponent(noticeId)}`;
}

export function findATenderReleaseUrl(noticeId: string): string {
  return `${FIND_A_TENDER_RELEASE_API}/${encodeURIComponent(noticeId)}`;
}

export function formatOcdsDateTime(value: Date): string {
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
}

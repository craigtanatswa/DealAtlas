export const FIND_A_GRANT_SOURCE_KEY = "find-a-grant";

export const FIND_A_GRANT_HOST = "find-government-grants.service.gov.uk";

export const FIND_A_GRANT_ORIGIN = `https://${FIND_A_GRANT_HOST}`;

export const FIND_A_GRANT_LIST_URL = `${FIND_A_GRANT_ORIGIN}/grants`;

export const FIND_A_GRANT_TERMS_URL = `${FIND_A_GRANT_ORIGIN}/info/terms-and-conditions`;

export const FIND_A_GRANT_LICENCE_NAME = "Open Government Licence v3.0";

export const FIND_A_GRANT_LICENCE_URL =
  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

export const FIND_A_GRANT_PARSER_VERSION = "find-a-grant-page@1";

export const FIND_A_GRANT_PAGE_SIZE = 10;

export const FIND_A_GRANT_FETCH_POLICY = {
  protocol: "https:" as const,
  hosts: [FIND_A_GRANT_HOST],
  pathPrefixes: ["/grants", "/robots.txt"],
};

export function findAGrantPageUrl(page: number): string {
  const url = new URL(FIND_A_GRANT_LIST_URL);
  if (page > 1) url.searchParams.set("page", String(page));
  return url.toString();
}

export function findAGrantRecordUrl(label: string, id: string): string {
  const slug = label.trim();
  if (slug) return `${FIND_A_GRANT_ORIGIN}/grants/${encodeURIComponent(slug)}`;
  return `${FIND_A_GRANT_LIST_URL}#${encodeURIComponent(id)}`;
}

export const INNOVATE_UK_SOURCE_KEY = "innovate-uk";

export const INNOVATE_UK_HOST = "apply-for-innovation-funding.service.gov.uk";

export const INNOVATE_UK_ORIGIN = `https://${INNOVATE_UK_HOST}`;

export const INNOVATE_UK_SEARCH_URL = `${INNOVATE_UK_ORIGIN}/competition/search`;

export const INNOVATE_UK_TERMS_URL = `${INNOVATE_UK_ORIGIN}/info/terms-and-conditions`;

export const INNOVATE_UK_LICENCE_NAME = "Open Government Licence v3.0";

export const INNOVATE_UK_LICENCE_URL =
  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

export const INNOVATE_UK_PARSER_VERSION = "innovate-uk-competition-search@1";

export const INNOVATE_UK_FETCH_POLICY = {
  protocol: "https:" as const,
  hosts: [INNOVATE_UK_HOST],
  pathPrefixes: ["/competition/search", "/robots.txt"],
};

export function innovateUkSearchUrl(page: number): string {
  const url = new URL(INNOVATE_UK_SEARCH_URL);
  if (page > 0) url.searchParams.set("page", String(page));
  return url.toString();
}

export function innovateUkCompetitionUrl(path: string): string {
  return new URL(path, `${INNOVATE_UK_ORIGIN}/`).toString();
}

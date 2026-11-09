import { IngestionError } from "@/ingestion/core/errors";

export const GCA_AGREEMENTS_SOURCE_KEY = "gca-agreements";
export const GCA_PIPELINE_SOURCE_KEY = "gca-procurement-pipeline";

export const GCA_HOST = "www.gca.gov.uk";
export const GCA_ORIGIN = `https://${GCA_HOST}`;
export const GCA_AGREEMENTS_API = `${GCA_ORIGIN}/api/frameworks`;
export const GCA_TERMS_URL = `${GCA_ORIGIN}/terms-and-conditions`;
export const GCA_ROBOTS_URL = `${GCA_ORIGIN}/robots.txt`;

export const GCA_ASSETS_HOST = "assets.gca.gov.uk";
export const GCA_PIPELINE_FILE =
  "https://assets.gca.gov.uk/wp-content/uploads/Government-Commercial-Agency-Pipeline-10.08.2026.ods.xlsx.ods";

export const GCA_LICENCE_NAME = "Open Government Licence v3.0";
export const GCA_LICENCE_URL =
  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

export const GCA_AGREEMENTS_PARSER_VERSION = "gca-agreements-api@1";
export const GCA_PIPELINE_PARSER_VERSION = "gca-procurement-pipeline-ods@1";

/** Official feed only. robots.txt disallows page, limit, status, search and keyword. */
export const GCA_MAX_REQUESTS_PER_MINUTE = 6;

export const GCA_AGREEMENTS_FETCH_POLICY = {
  protocol: "https:" as const,
  hosts: [GCA_HOST],
  pathPrefixes: ["/api/frameworks"],
};

export const GCA_PIPELINE_FETCH_POLICY = {
  protocol: "https:" as const,
  hosts: [GCA_ASSETS_HOST],
  pathPrefixes: ["/wp-content/uploads/Government-Commercial-Agency-Pipeline-"],
};

export const GCA_BUYER_NAME = "Government Commercial Agency";

export function gcaAgreementUrl(rmNumber: string): string {
  return `${GCA_ORIGIN}/agreements/${encodeURIComponent(rmNumber)}`;
}

/** robots.txt Disallow patterns that must not appear on a feed URL. */
const BLOCKED_FEED_QUERY =
  /(?:^|[?&])(?:page|limit|status|statuses|keyword|search|q|type|categories|sectors|framework)(?:=|%5b|\[)/i;

export function assertRobotsCleanFeedUrl(value: string): void {
  const url = new URL(value);
  if (url.search && BLOCKED_FEED_QUERY.test(url.search)) {
    throw new IngestionError({
      message: "GCA feed URL uses a robots.txt disallowed query.",
      stage: "discover",
      code: "ROBOTS_QUERY_DENIED",
      retryable: false,
    });
  }
}

export const UK_INFRASTRUCTURE_PIPELINE_SOURCE_KEY = "uk-infrastructure-pipeline";

export const NISTA_HOST = "pipeline.nista.grid.civilservice.gov.uk";

export const NISTA_ORIGIN = `https://${NISTA_HOST}`;

export const NISTA_LAYOUT_API = `${NISTA_ORIGIN}/_dash-layout`;

export const NISTA_PUBLICATION_URL =
  "https://www.gov.uk/government/publications/uk-infrastructure-pipeline";

export const NISTA_TERMS_URL = "https://www.gov.uk/help/terms-conditions";

export const NISTA_LICENCE_NAME = "Open Government Licence v3.0";

export const NISTA_LICENCE_URL =
  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

export const NISTA_PARSER_VERSION = "uk-infrastructure-pipeline-nista@1";

export const NISTA_TIMEOUT_MS = 120_000;

export const NISTA_FETCH_POLICY = {
  protocol: "https:" as const,
  hosts: [NISTA_HOST],
  pathPrefixes: ["/_dash-layout"],
};

export function nistaProjectUrl(projectId: string): string {
  const url = new URL(NISTA_ORIGIN);
  url.searchParams.set("project_id", projectId);
  return url.toString();
}

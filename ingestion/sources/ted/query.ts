import {
  TED_COMPETITION_NOTICE_TYPES,
  TED_OPEN_PROCEDURE_TYPES,
  TED_SEARCH_FIELDS,
  TED_UK_SME_PLACES,
} from "@/ingestion/sources/ted/constants";

export type TedSearchWindow = {
  publishedFrom?: string;
  publishedTo?: string;
  /** UTC day `YYYYMMDD`. Rows are still checked against the exact deadline. */
  deadlineOn: string;
};

export function buildTedExpertQuery(window: TedSearchWindow): string {
  const notices = TED_COMPETITION_NOTICE_TYPES.join(" ");
  const procedures = TED_OPEN_PROCEDURE_TYPES.join(" ");
  const places = TED_UK_SME_PLACES.join(" ");
  const parts = [
    `notice-type IN (${notices})`,
    `(procedure-type IN (${procedures}) OR notice-type = cn-desg)`,
    "submission-language = ENG",
    `deadline-receipt-request >= ${window.deadlineOn}`,
    `place-of-performance IN (${places})`,
  ];
  if (window.publishedFrom) {
    parts.push(`publication-date >= ${window.publishedFrom}`);
  }
  if (window.publishedTo) {
    parts.push(`publication-date <= ${window.publishedTo}`);
  }
  return parts.join(" AND ");
}

export function buildTedSearchBody(
  window: TedSearchWindow,
  limit: number,
  iterationNextToken?: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query: buildTedExpertQuery(window),
    fields: [...TED_SEARCH_FIELDS],
    limit,
    scope: "ALL",
    checkQuerySyntax: false,
    paginationMode: "ITERATION",
  };
  if (iterationNextToken) {
    body.iterationNextToken = iterationNextToken;
  }
  return body;
}

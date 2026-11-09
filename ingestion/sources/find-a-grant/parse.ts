import { IngestionError } from "@/ingestion/core/errors";
import { asNumber, asRecord, asString } from "@/ingestion/normalizers/text";
import {
  FIND_A_GRANT_PAGE_SIZE,
  FIND_A_GRANT_SOURCE_KEY,
  findAGrantRecordUrl,
} from "@/ingestion/sources/find-a-grant/constants";
import { buildGrantCandidate, parseGrantDate } from "@/ingestion/sources/grant-notice/map";

export type FindAGrantPage = {
  grants: unknown[];
  page: number;
  total: number;
};

export function extractFindAGrantPage(html: string): FindAGrantPage {
  const match = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(
    html,
  );
  if (!match?.[1]) {
    throw new IngestionError({
      message: "Find a Grant page had no public data payload.",
      stage: "discover",
      code: "GRANT_PAGE_INVALID",
      retryable: false,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]) as unknown;
  } catch {
    throw new IngestionError({
      message: "Find a Grant page payload was not JSON.",
      stage: "discover",
      code: "GRANT_PAGE_INVALID",
      retryable: false,
    });
  }
  const pageProps = asRecord(asRecord(asRecord(parsed)?.props)?.pageProps);
  const grants = pageProps?.searchResult;
  if (!Array.isArray(grants)) {
    throw new IngestionError({
      message: "Find a Grant page payload had no grant list.",
      stage: "discover",
      code: "GRANT_PAGE_INVALID",
      retryable: false,
    });
  }
  const page = Number(asString(pageProps?.currentPage) ?? "1");
  const total = asNumber(pageProps?.totalGrants) ?? grants.length;
  return {
    grants,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    total,
  };
}

export function findAGrantExternalId(record: unknown, index: number): string {
  const row = asRecord(record);
  return asString(row?.id) ?? asString(row?.label) ?? `unidentified-${index + 1}`;
}

export function mapFindAGrantRecord(record: unknown, index: number, now: Date) {
  const row = asRecord(record);
  const id = findAGrantExternalId(record, index);
  const label = asString(row?.label) ?? "";
  const locations = Array.isArray(row?.grantLocation)
    ? row.grantLocation.map((item) => asString(item)).filter((item): item is string => Boolean(item))
    : [];
  const min = asNumber(row?.grantMinimumAward);
  const max = asNumber(row?.grantMaximumAward);
  const minDisplay = asString(row?.grantMinimumAwardDisplay);
  const maxDisplay = asString(row?.grantMaximumAwardDisplay);
  return buildGrantCandidate({
    sourceKey: FIND_A_GRANT_SOURCE_KEY,
    id,
    title: asString(row?.grantName) ?? "",
    description: asString(row?.grantShortDescription),
    sourceUrl: findAGrantRecordUrl(label, id),
    funder: asString(row?.grantFunder),
    opensAt: parseGrantDate(asString(row?.grantApplicationOpenDate)),
    closesAt: parseGrantDate(asString(row?.grantApplicationCloseDate)),
    valueMin: min,
    valueMax: max,
    exactValueText:
      minDisplay && maxDisplay ? `${minDisplay} to ${maxDisplay}` : maxDisplay ?? minDisplay,
    location: locations[0] ?? null,
    reference: label || id,
    mainCategory: "Funding",
    now,
  });
}

export function findAGrantHasNextPage(page: FindAGrantPage): boolean {
  return page.page * FIND_A_GRANT_PAGE_SIZE < page.total && page.grants.length > 0;
}

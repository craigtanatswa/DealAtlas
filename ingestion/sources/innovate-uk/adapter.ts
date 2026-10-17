import type {
  DiscoveredItem,
  DiscoverOptions,
  DiscoverResult,
  RawSourceRecord,
  SourceAdapter,
} from "@/ingestion/core/types";
import { createAllowlistedTextClient, type TextHttpClient } from "@/ingestion/core/http";
import { IngestionError } from "@/ingestion/core/errors";
import { assertRobotsAllow } from "@/ingestion/core/robots";
import { withRetry } from "@/ingestion/core/retry";
import {
  INNOVATE_UK_FETCH_POLICY,
  INNOVATE_UK_ORIGIN,
  INNOVATE_UK_PARSER_VERSION,
  INNOVATE_UK_SOURCE_KEY,
  innovateUkSearchUrl,
} from "@/ingestion/sources/innovate-uk/constants";
import {
  extractInnovateSearchPage,
  mapInnovateCompetition,
  type InnovateCompetition,
} from "@/ingestion/sources/innovate-uk/parse";

export type InnovateUkAdapterOptions = {
  http?: TextHttpClient;
  now?: () => Date;
};

export function createInnovateUkAdapter(
  options: InnovateUkAdapterOptions = {},
): SourceAdapter {
  const http = options.http ?? createAllowlistedTextClient(INNOVATE_UK_FETCH_POLICY);
  const now = options.now ?? (() => new Date());
  let robotsChecked = false;

  return {
    sourceKey: INNOVATE_UK_SOURCE_KEY,

    async discover(cursor?: string, discoverOptions?: DiscoverOptions): Promise<DiscoverResult> {
      if (!robotsChecked) {
        await assertRobotsAllow({
          http,
          robotsUrl: `${INNOVATE_UK_ORIGIN}/robots.txt`,
          path: "/competition/search",
          sourceLabel: "Innovate UK",
        });
        robotsChecked = true;
      }
      const pageNumber = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);
      const url = innovateUkSearchUrl(pageNumber);
      const response = await withRetry(() => http.getText(url));
      const page = extractInnovateSearchPage(response.body);
      const limit = Math.min(100, Math.max(1, discoverOptions?.limit ?? page.competitions.length));
      const items: DiscoveredItem[] = page.competitions.slice(0, limit).map((record) => ({
        externalRecordId: record.id,
        sourceUrl: url,
        payload: record,
      }));
      const next =
        page.nextPage != null && page.nextPage !== pageNumber ? String(page.nextPage) : undefined;
      return { items, nextCursor: next };
    },

    async fetch(item: DiscoveredItem): Promise<RawSourceRecord> {
      if (item.payload == null) {
        throw new IngestionError({
          message: "Innovate UK discover did not include a competition.",
          stage: "fetch",
          code: "COMPETITION_FETCH_REQUIRES_PAYLOAD",
          retryable: false,
        });
      }
      return {
        externalRecordId: item.externalRecordId,
        sourceUrl: item.sourceUrl,
        publishedAt: null,
        fetchedAt: now().toISOString(),
        contentType: "text/html",
        parserVersion: INNOVATE_UK_PARSER_VERSION,
        payload: item.payload,
        http: {
          status: 200,
          url: item.sourceUrl ?? innovateUkSearchUrl(0),
          contentType: "text/html",
        },
      };
    },

    async parse(raw) {
      return [mapInnovateCompetition(raw.payload as InnovateCompetition, now())];
    },
  };
}

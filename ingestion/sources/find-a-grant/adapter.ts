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
  FIND_A_GRANT_FETCH_POLICY,
  FIND_A_GRANT_ORIGIN,
  FIND_A_GRANT_PARSER_VERSION,
  FIND_A_GRANT_SOURCE_KEY,
  findAGrantPageUrl,
} from "@/ingestion/sources/find-a-grant/constants";
import {
  extractFindAGrantPage,
  findAGrantExternalId,
  findAGrantHasNextPage,
  mapFindAGrantRecord,
} from "@/ingestion/sources/find-a-grant/parse";

export type FindAGrantAdapterOptions = {
  http?: TextHttpClient;
  now?: () => Date;
};

export function createFindAGrantAdapter(
  options: FindAGrantAdapterOptions = {},
): SourceAdapter {
  const http =
    options.http ?? createAllowlistedTextClient(FIND_A_GRANT_FETCH_POLICY);
  const now = options.now ?? (() => new Date());
  let robotsChecked = false;

  return {
    sourceKey: FIND_A_GRANT_SOURCE_KEY,

    async discover(cursor?: string, discoverOptions?: DiscoverOptions): Promise<DiscoverResult> {
      if (!robotsChecked) {
        await assertRobotsAllow({
          http,
          robotsUrl: `${FIND_A_GRANT_ORIGIN}/robots.txt`,
          path: "/grants",
          sourceLabel: "Find a Grant",
        });
        robotsChecked = true;
      }
      const pageNumber = Math.max(1, Number.parseInt(cursor ?? "1", 10) || 1);
      const url = findAGrantPageUrl(pageNumber);
      const response = await withRetry(() => http.getText(url));
      const page = extractFindAGrantPage(response.body);
      const limit = Math.min(100, Math.max(1, discoverOptions?.limit ?? page.grants.length));
      const items: DiscoveredItem[] = [];
      for (const [index, record] of page.grants.slice(0, limit).entries()) {
        items.push({
          externalRecordId: findAGrantExternalId(record, index),
          sourceUrl: url,
          payload: { record, index },
        });
      }
      return {
        items,
        nextCursor: findAGrantHasNextPage(page) ? String(page.page + 1) : undefined,
      };
    },

    async fetch(item: DiscoveredItem): Promise<RawSourceRecord> {
      if (item.payload == null) {
        throw new IngestionError({
          message: "Find a Grant discover did not include a record.",
          stage: "fetch",
          code: "GRANT_FETCH_REQUIRES_PAYLOAD",
          retryable: false,
        });
      }
      return {
        externalRecordId: item.externalRecordId,
        sourceUrl: item.sourceUrl,
        publishedAt: null,
        fetchedAt: now().toISOString(),
        contentType: "text/html",
        parserVersion: FIND_A_GRANT_PARSER_VERSION,
        payload: item.payload,
        http: {
          status: 200,
          url: item.sourceUrl ?? findAGrantPageUrl(1),
          contentType: "text/html",
        },
      };
    },

    async parse(raw) {
      const payload = raw.payload as { record?: unknown; index?: number };
      return [mapFindAGrantRecord(payload.record, payload.index ?? 0, now())];
    },
  };
}

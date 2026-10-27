import type {
  DiscoveredItem,
  DiscoverOptions,
  DiscoverResult,
  RawSourceRecord,
  SourceAdapter,
} from "@/ingestion/core/types";
import {
  createAllowlistedJsonClient,
  type JsonHttpClient,
} from "@/ingestion/core/http";
import { IngestionError } from "@/ingestion/core/errors";
import { withRetry } from "@/ingestion/core/retry";
import { asRecord, asString } from "@/ingestion/normalizers/text";
import {
  TED_FETCH_POLICY,
  TED_PARSER_VERSION,
  TED_SEARCH_API,
  TED_SOURCE_KEY,
  formatTedDate,
  tedDateFromOcds,
  tedNoticeUrl,
} from "@/ingestion/sources/ted/constants";
import { parseTedRaw, parseTedSearchPage } from "@/ingestion/sources/ted/parse";
import { buildTedSearchBody, type TedSearchWindow } from "@/ingestion/sources/ted/query";

export type TedAdapterOptions = {
  http?: JsonHttpClient;
  now?: () => Date;
};

type TedCursor = TedSearchWindow & { token?: string };

export function createTedAdapter(options: TedAdapterOptions = {}): SourceAdapter {
  const http = options.http ?? createAllowlistedJsonClient(TED_FETCH_POLICY);
  const now = options.now ?? (() => new Date());

  return {
    sourceKey: TED_SOURCE_KEY,

    async discover(cursor?: string, discoverOptions?: DiscoverOptions): Promise<DiscoverResult> {
      const limit = Math.min(100, Math.max(1, discoverOptions?.limit ?? 20));
      const resumed = cursor ? decodeTedCursor(cursor) : null;
      const window = resumed ?? windowFromOptions(discoverOptions, now());
      const postJson = http.postJson;
      if (!postJson) {
        throw new IngestionError({
          message: `TED search on ${new URL(TED_SEARCH_API).hostname} requires POST.`,
          stage: "fetch",
          code: "HTTP_METHOD",
        });
      }
      const response = await withRetry(() =>
        postJson(
          TED_SEARCH_API,
          buildTedSearchBody(window, limit, window.token),
        ),
      );
      const page = parseTedSearchPage(response.body);
      if (page.timedOut) {
        throw new IngestionError({
          message: `TED search timed out on ${new URL(TED_SEARCH_API).hostname}`,
          stage: "fetch",
          code: "HTTP_TIMEOUT",
          retryable: true,
        });
      }
      const items: DiscoveredItem[] = [];
      for (const notice of page.notices) {
        const record = asRecord(notice);
        const id = asString(record?.["publication-number"])?.trim();
        if (!id) {
          continue;
        }
        items.push({
          externalRecordId: id,
          ocid: `ted-${id}`,
          sourceUrl: englishNoticeUrl(record?.links) ?? tedNoticeUrl(id),
          payload: { notice },
        });
      }
      return {
        items,
        nextCursor: page.nextToken
          ? encodeTedCursor({ ...window, token: page.nextToken })
          : undefined,
      };
    },

    async fetch(item: DiscoveredItem): Promise<RawSourceRecord> {
      const fetchedAt = now().toISOString();
      const notice = asRecord(item.payload)?.notice ?? item.payload;
      if (notice == null) {
        throw new IngestionError({
          message: "TED search result did not include a notice payload.",
          stage: "fetch",
          code: "EMPTY_NOTICE",
        });
      }
      const record = asRecord(notice);
      return {
        externalRecordId: item.externalRecordId,
        sourceUrl: item.sourceUrl ?? tedNoticeUrl(item.externalRecordId),
        publishedAt: asString(record?.["publication-date"]),
        fetchedAt,
        contentType: "application/json",
        parserVersion: TED_PARSER_VERSION,
        payload: { notice },
        http: {
          status: 200,
          url: TED_SEARCH_API,
          contentType: "application/json",
        },
      };
    },

    async parse(raw) {
      return parseTedRaw(raw.payload, now());
    },
  };
}

function windowFromOptions(options: DiscoverOptions | undefined, now: Date): TedCursor {
  return {
    publishedFrom: options?.updatedFrom ? tedDateFromOcds(options.updatedFrom) ?? undefined : undefined,
    publishedTo: options?.updatedTo ? tedDateFromOcds(options.updatedTo) ?? undefined : undefined,
    deadlineOn: formatTedDate(now),
  };
}

function encodeTedCursor(cursor: TedCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeTedCursor(cursor: string): TedCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    const record = asRecord(parsed);
    const deadlineOn = asString(record?.deadlineOn);
    if (!deadlineOn || !/^\d{8}$/.test(deadlineOn)) {
      throw new Error("cursor");
    }
    return {
      publishedFrom: asString(record?.publishedFrom) ?? undefined,
      publishedTo: asString(record?.publishedTo) ?? undefined,
      deadlineOn,
      token: asString(record?.token) ?? undefined,
    };
  } catch (error) {
    if (error instanceof IngestionError) {
      throw error;
    }
    throw new IngestionError({
      message: "cursor",
      stage: "discover",
      code: "CURSOR_INVALID",
    });
  }
}

function englishNoticeUrl(links: unknown): string | null {
  const html = asRecord(asRecord(links)?.html);
  return asString(html?.ENG) ?? asString(html?.eng) ?? null;
}

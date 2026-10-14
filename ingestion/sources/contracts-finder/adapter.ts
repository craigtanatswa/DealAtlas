import type {
  DiscoveredItem,
  DiscoverOptions,
  DiscoverResult,
  RawSourceRecord,
  SourceAdapter,
} from "@/ingestion/core/types";
import {
  assertAllowedUrl,
  createAllowlistedJsonClient,
  type JsonHttpClient,
} from "@/ingestion/core/http";
import { IngestionError } from "@/ingestion/core/errors";
import { withRetry } from "@/ingestion/core/retry";
import { asRecord, asString } from "@/ingestion/normalizers/text";
import {
  CONTRACTS_FINDER_FETCH_POLICY,
  CONTRACTS_FINDER_PARSER_VERSION,
  CONTRACTS_FINDER_SEARCH_API,
  CONTRACTS_FINDER_SOURCE_KEY,
  contractsFinderNoticeUrl,
  formatOcdsDateTime,
} from "@/ingestion/sources/contracts-finder/constants";
import {
  parseContractsFinderPackage,
  parseContractsFinderRaw,
} from "@/ingestion/sources/contracts-finder/parse";
import { unwrapReleasePayload } from "@/ingestion/sources/find-a-tender/parse";

export type ContractsFinderAdapterOptions = {
  http?: JsonHttpClient;
  now?: () => Date;
  defaultLookbackHours?: number;
};

export function createContractsFinderAdapter(
  options: ContractsFinderAdapterOptions = {},
): SourceAdapter {
  const http =
    options.http ?? createAllowlistedJsonClient(CONTRACTS_FINDER_FETCH_POLICY);
  const now = options.now ?? (() => new Date());
  const lookbackHours = options.defaultLookbackHours ?? 24;

  return {
    sourceKey: CONTRACTS_FINDER_SOURCE_KEY,

    async discover(cursor?: string, discoverOptions?: DiscoverOptions): Promise<DiscoverResult> {
      const limit = Math.min(100, Math.max(1, discoverOptions?.limit ?? 20));
      const publishedTo =
        discoverOptions?.updatedTo ?? formatOcdsDateTime(now());
      const publishedFrom =
        discoverOptions?.updatedFrom ??
        formatOcdsDateTime(new Date(now().getTime() - lookbackHours * 60 * 60 * 1000));

      const url = new URL(CONTRACTS_FINDER_SEARCH_API);
      url.searchParams.set("limit", String(limit));
      const resumedWindow = cursor ? parseContractsFinderCursorWindow(cursor) : null;
      url.searchParams.set("publishedFrom", resumedWindow?.publishedFrom ?? publishedFrom);
      url.searchParams.set("publishedTo", resumedWindow?.publishedTo ?? publishedTo);
      if (!resumedWindow && discoverOptions?.stages) {
        url.searchParams.set("stages", discoverOptions.stages);
      }
      if (cursor) {
        url.searchParams.set("cursor", resumedWindow?.cursor ?? cursor);
      }

      const response = await withRetry(() => http.getJson(url.toString()));
      const pkg = parseContractsFinderPackage(response.body);
      const items: DiscoveredItem[] = [];
      for (const release of pkg.releases ?? []) {
        const record = asRecord(release);
        const id = asString(record?.id);
        if (!id) {
          continue;
        }
        items.push({
          externalRecordId: id,
          ocid: asString(record?.ocid) ?? undefined,
          sourceUrl: contractsFinderNoticeUrl(id),
          payload: {
            license: pkg.license,
            publisher: pkg.publisher,
            release,
          },
        });
      }

      return {
        items,
        nextCursor: cursorFromNextLink(pkg.links?.next),
      };
    },

    async fetch(item: DiscoveredItem): Promise<RawSourceRecord> {
      const fetchedAt = now().toISOString();
      if (item.payload != null) {
        return {
          externalRecordId: item.externalRecordId,
          sourceUrl: item.sourceUrl ?? contractsFinderNoticeUrl(item.externalRecordId),
          publishedAt: asString(asRecord(unwrapReleasePayload(item.payload))?.date),
          fetchedAt,
          contentType: "application/json",
          parserVersion: CONTRACTS_FINDER_PARSER_VERSION,
          payload: item.payload,
          http: {
            status: 200,
            url: CONTRACTS_FINDER_SEARCH_API,
            contentType: "application/json",
          },
        };
      }

      throw new IngestionError({
        message: "Contracts Finder search result did not include a release payload.",
        stage: "fetch",
        code: "EMPTY_RELEASE_PACKAGE",
      });
    },

    async parse(raw) {
      return parseContractsFinderRaw(raw.payload, now());
    },
  };
}

function parseContractsFinderCursorWindow(
  cursor: string,
): { publishedFrom: string; publishedTo: string; cursor: string } | null {
  const fromEncoded = (text: string) => {
    const match =
      /^publishedFrom=([^|]+)\|publishedTo=([^|]+)\|nextCursor=(.*)$/.exec(text);
    return match?.[1] && match?.[2] && match[3]
      ? { publishedFrom: match[1], publishedTo: match[2], cursor: match[3] }
      : null;
  };
  const direct = fromEncoded(cursor);
  if (direct) {
    return direct;
  }
  try {
    return fromEncoded(Buffer.from(cursor, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function cursorFromNextLink(next?: string): string | undefined {
  if (!next) {
    return undefined;
  }
  try {
    const url = assertAllowedUrl(next, CONTRACTS_FINDER_FETCH_POLICY);
    const cursor = url.searchParams.get("cursor");
    if (!cursor) {
      return undefined;
    }
    const publishedFrom = url.searchParams.get("publishedFrom");
    const publishedTo = url.searchParams.get("publishedTo");
    if (publishedFrom && publishedTo) {
      return `publishedFrom=${publishedFrom}|publishedTo=${publishedTo}|nextCursor=${cursor}`;
    }
    return cursor;
  } catch {
    return undefined;
  }
}

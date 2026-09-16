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
  FIND_A_TENDER_FETCH_POLICY,
  FIND_A_TENDER_PARSER_VERSION,
  FIND_A_TENDER_RELEASE_API,
  FIND_A_TENDER_SOURCE_KEY,
  findATenderNoticeUrl,
  findATenderReleaseUrl,
  formatOcdsDateTime,
} from "@/ingestion/sources/find-a-tender/constants";
import {
  parseFindATenderRaw,
  parseReleasePackage,
  unwrapReleasePayload,
} from "@/ingestion/sources/find-a-tender/parse";

export type FindATenderAdapterOptions = {
  http?: JsonHttpClient;
  now?: () => Date;
  defaultLookbackHours?: number;
};

export function createFindATenderAdapter(
  options: FindATenderAdapterOptions = {},
): SourceAdapter {
  const http = options.http ?? createAllowlistedJsonClient(FIND_A_TENDER_FETCH_POLICY);
  const now = options.now ?? (() => new Date());
  const lookbackHours = options.defaultLookbackHours ?? 24;

  return {
    sourceKey: FIND_A_TENDER_SOURCE_KEY,

    async discover(cursor?: string, discoverOptions?: DiscoverOptions): Promise<DiscoverResult> {
      const limit = Math.min(100, Math.max(1, discoverOptions?.limit ?? 20));
      const updatedTo =
        discoverOptions?.updatedTo ?? formatOcdsDateTime(now());
      const updatedFrom =
        discoverOptions?.updatedFrom ??
        formatOcdsDateTime(new Date(now().getTime() - lookbackHours * 60 * 60 * 1000));

      const url = new URL(FIND_A_TENDER_RELEASE_API);
      url.searchParams.set("limit", String(limit));
      const resumedWindow = cursor ? parseFindATenderCursorWindow(cursor) : null;
      // Find a Tender rejects a cursor unless it is sent with the same
      // updatedFrom/updatedTo window that created it. A new 24h window plus an
      // old cursor, or a cursor with no window, both return HTTP 400.
      url.searchParams.set("updatedFrom", resumedWindow?.updatedFrom ?? updatedFrom);
      url.searchParams.set("updatedTo", resumedWindow?.updatedTo ?? updatedTo);
      if (!resumedWindow && discoverOptions?.stages) {
        url.searchParams.set("stages", discoverOptions.stages);
      }
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      const response = await withRetry(() => http.getJson(url.toString()));
      const pkg = parseReleasePackage(response.body);
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
          sourceUrl: findATenderNoticeUrl(id),
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
          sourceUrl: item.sourceUrl ?? findATenderNoticeUrl(item.externalRecordId),
          publishedAt: asString(asRecord(unwrapReleasePayload(item.payload))?.date),
          fetchedAt,
          contentType: "application/json",
          parserVersion: FIND_A_TENDER_PARSER_VERSION,
          payload: item.payload,
          http: {
            status: 200,
            url: findATenderReleaseUrl(item.externalRecordId),
            contentType: "application/json",
          },
        };
      }

      const url = findATenderReleaseUrl(item.externalRecordId);
      const response = await withRetry(() => http.getJson(url));
      const pkg = parseReleasePackage(response.body);
      const release = pkg.releases?.[0];
      if (!release) {
        throw new IngestionError({
          message: `Find a Tender release ${item.externalRecordId} returned no releases.`,
          stage: "fetch",
          code: "EMPTY_RELEASE_PACKAGE",
        });
      }

      return {
        externalRecordId: item.externalRecordId,
        sourceUrl: item.sourceUrl ?? findATenderNoticeUrl(item.externalRecordId),
        publishedAt: asString(asRecord(release)?.date),
        fetchedAt,
        contentType: response.contentType,
        parserVersion: FIND_A_TENDER_PARSER_VERSION,
        payload: {
          license: pkg.license,
          publisher: pkg.publisher,
          release,
        },
        http: {
          status: response.status,
          url: response.url,
          contentType: response.contentType,
        },
      };
    },

    async parse(raw) {
      return parseFindATenderRaw(raw.payload, now());
    },
  };
}

function parseFindATenderCursorWindow(
  cursor: string,
): { updatedFrom: string; updatedTo: string } | null {
  const fromEncoded = (text: string) => {
    const match = /^updatedFrom=([^|]+)\|updatedTo=([^|]+)\|nextCursor=/.exec(
      text,
    );
    return match?.[1] && match[2]
      ? { updatedFrom: match[1], updatedTo: match[2] }
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
    const url = assertAllowedUrl(next, FIND_A_TENDER_FETCH_POLICY);
    return url.searchParams.get("cursor") ?? undefined;
  } catch {
    return undefined;
  }
}

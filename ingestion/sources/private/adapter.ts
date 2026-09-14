import type {
  DiscoveredItem,
  DiscoverOptions,
  DiscoverResult,
  RawSourceRecord,
  SourceAdapter,
} from "@/ingestion/core/types";
import {
  createAllowlistedJsonClient,
  createAllowlistedTextClient,
} from "@/ingestion/core/http";
import { IngestionError } from "@/ingestion/core/errors";
import { withRetry } from "@/ingestion/core/retry";
import type {
  PrivateAdapterOptions,
  PrivateSourceDefinition,
} from "@/ingestion/sources/private/types";

export function createPrivateSourceAdapter(
  definition: PrivateSourceDefinition,
  options: PrivateAdapterOptions = {},
): SourceAdapter {
  const jsonHttp =
    options.httpJson ??
    createAllowlistedJsonClient(definition.fetchPolicy, {
      timeoutMs: definition.timeoutMs,
    });
  const textHttp =
    options.httpText ??
    createAllowlistedTextClient(definition.fetchPolicy, {
      timeoutMs: definition.timeoutMs,
    });
  const now = options.now ?? (() => new Date());
  let cachedRecords: unknown[] | null = null;

  return {
    sourceKey: definition.sourceKey,

    async discover(cursor?: string, discoverOptions?: DiscoverOptions): Promise<DiscoverResult> {
      if (!cachedRecords) {
        const raw = await fetchPayload(definition, jsonHttp, textHttp);
        cachedRecords = definition.extractRecords(raw.body, raw.text);
      }
      const records = cachedRecords;
      const offset = Number.parseInt(cursor ?? "0", 10) || 0;
      const limit = Math.min(100, Math.max(1, discoverOptions?.limit ?? 20));
      const page = records.slice(offset, offset + limit);
      const items: DiscoveredItem[] = [];

      for (const record of page) {
        const id = definition.recordId(record);
        if (!id) {
          continue;
        }
        items.push({
          externalRecordId: id,
          sourceUrl: definition.sourceUrlFor(record, id),
          payload: {
            format: definition.format,
            record,
          },
        });
      }

      const nextOffset = offset + page.length;
      return {
        items,
        nextCursor:
          nextOffset < records.length && page.length > 0 ? String(nextOffset) : undefined,
      };
    },

    async fetch(item: DiscoveredItem): Promise<RawSourceRecord> {
      const fetchedAt = now().toISOString();
      if (item.payload != null) {
        return {
          externalRecordId: item.externalRecordId,
          sourceUrl: item.sourceUrl,
          publishedAt: null,
          fetchedAt,
          contentType: contentTypeFor(definition.format),
          parserVersion: definition.parserVersion,
          payload: item.payload,
          http: {
            status: 200,
            url: item.sourceUrl ?? definition.discoverUrl,
            contentType: contentTypeFor(definition.format),
          },
        };
      }

      throw new IngestionError({
        message: `Private source ${definition.sourceKey} requires discover payload for ${item.externalRecordId}.`,
        stage: "fetch",
        code: "PRIVATE_FETCH_REQUIRES_PAYLOAD",
        retryable: false,
      });
    },

    async parse(raw) {
      const record = unwrapPrivateRecord(raw.payload);
      return [
        definition.mapRecord(record, {
          sourceKey: definition.sourceKey,
          sourceUrl: raw.sourceUrl ?? definition.sourceUrlFor(record, raw.externalRecordId),
          parserVersion: definition.parserVersion,
          now: now(),
        }),
      ];
    },
  };
}

async function fetchPayload(
  definition: PrivateSourceDefinition,
  jsonHttp: ReturnType<typeof createAllowlistedJsonClient>,
  textHttp: ReturnType<typeof createAllowlistedTextClient>,
): Promise<{ body: unknown; text?: string }> {
  if (definition.format === "json") {
    const response = await withRetry(() => jsonHttp.getJson(definition.discoverUrl));
    return { body: response.body, text: response.rawText };
  }
  const response = await withRetry(() => textHttp.getText(definition.discoverUrl));
  return { body: response.body, text: response.body };
}

function unwrapPrivateRecord(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "record" in payload) {
    return (payload as { record: unknown }).record;
  }
  return payload;
}

function contentTypeFor(format: PrivateSourceDefinition["format"]): string {
  if (format === "csv") {
    return "text/csv";
  }
  if (format === "html") {
    return "text/html";
  }
  return "application/json";
}

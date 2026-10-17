import type {
  DiscoveredItem,
  DiscoverOptions,
  DiscoverResult,
  RawSourceRecord,
  SourceAdapter,
} from "@/ingestion/core/types";
import type { AllowedFetchPolicy, JsonHttpClient } from "@/ingestion/core/http";
import {
  assertAllowedUrl,
  createAllowlistedJsonClient,
} from "@/ingestion/core/http";
import { IngestionError } from "@/ingestion/core/errors";
import { withRetry } from "@/ingestion/core/retry";
import { asRecord, asString } from "@/ingestion/normalizers/text";
import { unwrapReleasePayload } from "@/ingestion/sources/find-a-tender/parse";
import { parseMonthlyOcdsPackage, parseMonthlyOcdsRaw } from "@/ingestion/sources/ocds-monthly/parse";

export type MonthlyOcdsSource = {
  sourceKey: string;
  origin: string;
  fetchPolicy: AllowedFetchPolicy;
  noticeTypes: readonly number[];
  locale?: string;
  parserVersion: string;
  noticeUrl: (ocid: string) => string;
};

export type MonthlyOcdsAdapterOptions = {
  http?: JsonHttpClient;
  now?: () => Date;
  noticeTypes?: readonly number[];
};

type WindowState = {
  from: string;
  to: string;
  step: number;
  offset: number;
};

type CachedPackage = {
  license?: string;
  publisher?: unknown;
  releases: unknown[];
};

export function createMonthlyOcdsAdapter(
  source: MonthlyOcdsSource,
  options: MonthlyOcdsAdapterOptions = {},
): SourceAdapter {
  const http = options.http ?? createAllowlistedJsonClient(source.fetchPolicy);
  const now = options.now ?? (() => new Date());
  const noticeTypes = options.noticeTypes ?? source.noticeTypes;
  const cache = new Map<string, CachedPackage>();
  const emitted = new Set<string>();

  return {
    sourceKey: source.sourceKey,

    async discover(cursor?: string, discoverOptions?: DiscoverOptions): Promise<DiscoverResult> {
      const limit = Math.min(100, Math.max(1, discoverOptions?.limit ?? 20));
      const state = resolveWindow(cursor, discoverOptions);
      const plan = planFor(state, noticeTypes, monthKey(now()));
      const items: DiscoveredItem[] = [];
      let step = state.step;
      let offset = state.offset;

      while (items.length < limit && step < plan.length) {
        const slot = plan[step];
        if (!slot) {
          break;
        }
        const pkg = await loadPackage(http, source, cache, slot.month, slot.noticeType);
        while (offset < pkg.releases.length && items.length < limit) {
          const release = pkg.releases[offset];
          offset += 1;
          const record = asRecord(release);
          const id = asString(record?.id);
          if (!id || emitted.has(id) || !includeRelease(release, state)) {
            continue;
          }
          emitted.add(id);
          const ocid = asString(record?.ocid) ?? undefined;
          items.push({
            externalRecordId: id,
            ocid,
            sourceUrl: ocid ? source.noticeUrl(ocid) : undefined,
            payload: {
              license: pkg.license,
              publisher: pkg.publisher,
              release,
            },
          });
        }
        if (offset >= pkg.releases.length) {
          step += 1;
          offset = 0;
        } else {
          break;
        }
      }

      return {
        items,
        nextCursor:
          step < plan.length ? encodeWindow({ ...state, step, offset }) : undefined,
      };
    },

    async fetch(item: DiscoveredItem): Promise<RawSourceRecord> {
      const fetchedAt = now().toISOString();
      if (item.payload != null) {
        const release = asRecord(unwrapReleasePayload(item.payload));
        const ocid = asString(release?.ocid);
        return {
          externalRecordId: item.externalRecordId,
          sourceUrl: item.sourceUrl ?? (ocid ? source.noticeUrl(ocid) : source.origin),
          publishedAt: asString(release?.date),
          fetchedAt,
          contentType: "application/json",
          parserVersion: source.parserVersion,
          payload: item.payload,
          http: {
            status: 200,
            url: noticesUrl(source, monthKey(now()), noticeTypes[0] ?? 2),
            contentType: "application/json",
          },
        };
      }

      throw new IngestionError({
        message: "OCDS notice list did not include a release payload.",
        stage: "fetch",
        code: "EMPTY_RELEASE_PACKAGE",
      });
    },

    async parse(raw) {
      return parseMonthlyOcdsRaw(raw.payload, now(), source);
    },
  };
}

async function loadPackage(
  http: JsonHttpClient,
  source: MonthlyOcdsSource,
  cache: Map<string, CachedPackage>,
  month: string,
  noticeType: number,
): Promise<CachedPackage> {
  const url = noticesUrl(source, month, noticeType);
  const cached = cache.get(url);
  if (cached) {
    return cached;
  }
  const response = await withRetry(() => http.getJson(url));
  const pkg = parseMonthlyOcdsPackage(response.body);
  const stored: CachedPackage = {
    license: pkg.license,
    publisher: pkg.publisher,
    releases: pkg.releases ?? [],
  };
  cache.set(url, stored);
  return stored;
}

export function noticesUrl(
  source: MonthlyOcdsSource,
  month: string,
  noticeType: number,
): string {
  const url = new URL("/v1/Notices", source.origin);
  url.searchParams.set("dateFrom", month);
  url.searchParams.set("noticeType", String(noticeType));
  url.searchParams.set("outputType", "0");
  if (source.locale) {
    url.searchParams.set("locale", source.locale);
  }
  return assertAllowedUrl(url.toString(), source.fetchPolicy).toString();
}

function resolveWindow(
  cursor: string | undefined,
  options: DiscoverOptions | undefined,
): WindowState {
  if (cursor) {
    const parsed = parseWindow(cursor);
    if (!parsed) {
      throw new IngestionError({
        message: "OCDS notice cursor was not understood.",
        stage: "discover",
        code: "CURSOR_INVALID",
      });
    }
    return parsed;
  }
  if (options?.updatedFrom && options?.updatedTo) {
    return { from: options.updatedFrom, to: options.updatedTo, step: 0, offset: 0 };
  }
  return { from: "", to: "", step: 0, offset: 0 };
}

function planFor(
  state: WindowState,
  noticeTypes: readonly number[],
  fallbackMonth: string,
): Array<{ month: string; noticeType: number }> {
  const months =
    state.from && state.to
      ? monthsCovering(parseBound(state.from), parseBound(state.to))
      : [fallbackMonth];
  const plan: Array<{ month: string; noticeType: number }> = [];
  for (const month of months) {
    for (const noticeType of noticeTypes) {
      plan.push({ month, noticeType });
    }
  }
  return plan;
}

function includeRelease(release: unknown, state: WindowState): boolean {
  if (!state.from || !state.to) {
    return true;
  }
  const date = asString(asRecord(release)?.date);
  if (!date) {
    return true;
  }
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return true;
  }
  return parsed >= parseBound(state.from) && parsed < parseBound(state.to);
}

export function monthsCovering(from: Date, to: Date): string[] {
  if (!(to.getTime() > from.getTime())) {
    return [];
  }
  const last = new Date(to.getTime() - 1);
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
  const months: string[] = [];
  while (cursor.getTime() <= end.getTime()) {
    months.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function monthKey(value: Date): string {
  return `${String(value.getUTCMonth() + 1).padStart(2, "0")}-${value.getUTCFullYear()}`;
}

function parseBound(value: string): Date {
  const withZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) {
    throw new IngestionError({
      message: "OCDS published window was not a date.",
      stage: "discover",
      code: "WINDOW_INVALID",
    });
  }
  return parsed;
}

function encodeWindow(state: WindowState): string {
  return `from=${state.from}|to=${state.to}|step=${state.step}|offset=${state.offset}`;
}

function parseWindow(cursor: string): WindowState | null {
  const match = /^from=([^|]*)\|to=([^|]*)\|step=(\d+)\|offset=(\d+)$/.exec(cursor);
  if (!match?.[3] || !match[4]) {
    return null;
  }
  return {
    from: match[1] ?? "",
    to: match[2] ?? "",
    step: Number(match[3]),
    offset: Number(match[4]),
  };
}

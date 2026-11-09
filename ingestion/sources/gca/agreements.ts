import type { SourceAdapter } from "@/ingestion/core/types";
import { createAllowlistedJsonClient, type JsonHttpClient } from "@/ingestion/core/http";
import { IngestionError } from "@/ingestion/core/errors";
import { defaultSleep } from "@/ingestion/core/retry";
import { createRequestPacer } from "@/ingestion/sources/find-a-tender/pace";
import { asRecord, asString } from "@/ingestion/normalizers/text";

import {
  GCA_AGREEMENTS_API,
  GCA_AGREEMENTS_FETCH_POLICY,
  GCA_AGREEMENTS_PARSER_VERSION,
  GCA_AGREEMENTS_SOURCE_KEY,
  GCA_MAX_REQUESTS_PER_MINUTE,
  assertRobotsCleanFeedUrl,
  gcaAgreementUrl,
} from "@/ingestion/sources/gca/constants";
import { agreementStatus, gcaCandidate } from "@/ingestion/sources/gca/map";
import { blank, isRmNumber, normaliseRm, parseUkDate } from "@/ingestion/sources/gca/text";

export type GcaAgreementsAdapterOptions = {
  http?: JsonHttpClient;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

export function createGcaAgreementsAdapter(
  options: GcaAgreementsAdapterOptions = {},
): SourceAdapter {
  const now = options.now ?? (() => new Date());
  const pace = createRequestPacer({
    maxRequests: GCA_MAX_REQUESTS_PER_MINUTE,
    windowMs: 60_000,
    now: () => now().getTime(),
    sleep: options.sleep ?? defaultSleep,
  });
  const http = options.http ?? createAllowlistedJsonClient(GCA_AGREEMENTS_FETCH_POLICY);
  let cached: { records: unknown[]; truncated: boolean } | null = null;

  return {
    sourceKey: GCA_AGREEMENTS_SOURCE_KEY,
    async discover(cursor, discoverOptions) {
      if (!cached) {
        assertRobotsCleanFeedUrl(GCA_AGREEMENTS_API);
        await pace();
        const response = await http.getJson(GCA_AGREEMENTS_API);
        cached = readAgreementsPayload(response.body);
      }
      const offset = Number.parseInt(cursor ?? "0", 10) || 0;
      const limit = Math.min(100, Math.max(1, discoverOptions?.limit ?? 20));
      const page = cached.records.slice(offset, offset + limit);
      const items = [];
      for (const record of page) {
        const rm = agreementRm(record);
        if (!rm) {
          continue;
        }
        items.push({
          externalRecordId: rm,
          sourceUrl: gcaAgreementUrl(rm),
          payload: { record },
        });
      }
      const next = offset + page.length;
      return {
        items,
        nextCursor: next < cached.records.length && page.length > 0 ? String(next) : undefined,
        truncated: cached.truncated,
      };
    },
    async fetch(item) {
      if (item.payload == null) {
        throw new IngestionError({
          message: "GCA agreements record was not in the feed payload.",
          stage: "fetch",
          code: "GCA_FETCH_REQUIRES_PAYLOAD",
          retryable: false,
        });
      }
      return {
        externalRecordId: item.externalRecordId,
        sourceUrl: item.sourceUrl ?? gcaAgreementUrl(item.externalRecordId),
        publishedAt: null,
        fetchedAt: now().toISOString(),
        contentType: "application/json",
        parserVersion: GCA_AGREEMENTS_PARSER_VERSION,
        payload: item.payload,
        http: { status: 200, url: GCA_AGREEMENTS_API, contentType: "application/json" },
      };
    },
    async parse(raw) {
      const record = asRecord(asRecord(raw.payload)?.record) ?? asRecord(raw.payload);
      return [mapGcaAgreement(record, now())];
    },
  };
}

export function readAgreementsPayload(payload: unknown): { records: unknown[]; truncated: boolean } {
  const body = asRecord(payload);
  const results = Array.isArray(body?.results) ? body.results : [];
  const total = Number(asRecord(body?.meta)?.total_results);
  return {
    records: results,
    truncated: Number.isFinite(total) && total > results.length,
  };
}

export function mapGcaAgreement(record: unknown, now: Date) {
  const row = asRecord(record);
  const rm = agreementRm(row);
  const title = blank(asString(row?.title));
  if (!rm || !title) {
    throw new IngestionError({
      message: "GCA agreement is missing an RM number or title.",
      stage: "parse",
      code: "GCA_RECORD_INCOMPLETE",
      retryable: false,
    });
  }
  const lots = Array.isArray(row?.lots) ? row.lots : [];
  return gcaCandidate({
    sourceKey: GCA_AGREEMENTS_SOURCE_KEY,
    rm,
    title,
    description: blank(asString(row?.summary)),
    category: blank(asString(row?.category)),
    mapped: agreementStatus({
      status: blank(asString(row?.status)),
      terms: blank(asString(row?.terms)),
      regulationType: blank(asString(row?.regulation_type)),
      endDate: parseUkDate(row?.end_date),
      now,
    }),
    now,
    contractStartDate: parseUkDate(row?.start_date),
    contractEndDate: parseUkDate(row?.end_date),
    nextProcurementDate: parseUkDate(row?.tenders_open_date),
    lots: lots.flatMap((lot) => {
      const item = asRecord(lot);
      const lotTitle = blank(asString(item?.title));
      if (!lotTitle) {
        return [];
      }
      return [{ title: lotTitle, description: blank(asString(item?.description)) }];
    }),
  });
}

function agreementRm(record: unknown): string | null {
  const rm = blank(asString(asRecord(record)?.rm_number));
  return rm && isRmNumber(rm) ? normaliseRm(rm) : null;
}

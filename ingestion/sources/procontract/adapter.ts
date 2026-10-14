import type {
  DiscoveredItem,
  DiscoverResult,
  RawSourceRecord,
  SourceAdapter,
} from "@/ingestion/core/types";
import {
  assertAllowedUrl,
  createAllowlistedTextClient,
  type TextHttpClient,
} from "@/ingestion/core/http";
import { IngestionError } from "@/ingestion/core/errors";
import { createRequestPacer } from "@/ingestion/sources/find-a-tender/pace";
import { defaultSleep } from "@/ingestion/core/retry";
import {
  PROCONTRACT_FETCH_POLICY,
  PROCONTRACT_MAX_REQUESTS_PER_MINUTE,
  PROCONTRACT_PARSER_VERSION,
  PROCONTRACT_REQUEST_WINDOW_MS,
  PROCONTRACT_USER_AGENT,
  pathBlockedByRobots,
  type ProcontractPortal,
} from "@/ingestion/sources/procontract/constants";
import {
  advertUrl,
  isAccessRestrictedHtml,
  parseProcontractDetail,
  parseProcontractListing,
  procontractCandidate,
  type ProcontractDetail,
  type ProcontractListingRow,
} from "@/ingestion/sources/procontract/parse";

export type ProcontractAdapterOptions = {
  portal: ProcontractPortal;
  http?: TextHttpClient;
  pace?: () => Promise<void>;
  now?: () => Date;
};

export function createProcontractTextClient(
  fetchImpl?: typeof fetch,
): TextHttpClient {
  return createAllowlistedTextClient(PROCONTRACT_FETCH_POLICY, {
    fetchImpl,
    accept: "text/html, application/rss+xml, application/atom+xml, text/csv",
    userAgent: PROCONTRACT_USER_AGENT,
  });
}

export function createProcontractAdapter(
  options: ProcontractAdapterOptions,
): SourceAdapter {
  const portal = options.portal;
  const now = options.now ?? (() => new Date());
  const http = options.http ?? createProcontractTextClient();
  const pace =
    options.pace ??
    createRequestPacer({
      maxRequests: PROCONTRACT_MAX_REQUESTS_PER_MINUTE,
      windowMs: PROCONTRACT_REQUEST_WINDOW_MS,
      sleep: defaultSleep,
    });

  return {
    sourceKey: portal.sourceKey,

    async discover(): Promise<DiscoverResult> {
      if (!portal.fetchPermitted || !portal.listingUrl) {
        return { items: [] };
      }
      const feedUrl = portal.rssUrl ?? portal.listingUrl;
      assertFetchable(feedUrl, portal);
      await pace();
      const listing = await http.getText(feedUrl);
      if (isAccessRestrictedHtml(listing.body)) {
        throw new IngestionError({
          message: "ProContract listing is a login or CAPTCHA wall.",
          stage: "discover",
          code: "ACCESS_RESTRICTED",
          retryable: false,
        });
      }
      const rows = parseProcontractListing(listing.body);
      const items: DiscoveredItem[] = [];
      for (const row of rows) {
        try {
          const detail = await fetchDetail(row, portal, http, pace);
          items.push({
            externalRecordId: row.advertId,
            ocid: detail?.ocid ?? undefined,
            sourceUrl: advertUrl(row.href),
            payload: { row, detail, fetchedUrl: listing.url },
          });
        } catch (error) {
          if (error instanceof IngestionError && error.code === "ACCESS_RESTRICTED") {
            break;
          }
          // Keep going. A later parse of a listing-only row can still succeed.
          items.push({
            externalRecordId: row.advertId,
            sourceUrl: advertUrl(row.href),
            payload: { row, detail: null, fetchedUrl: listing.url },
          });
        }
      }
      return { items };
    },

    async fetch(item: DiscoveredItem): Promise<RawSourceRecord> {
      return {
        externalRecordId: item.externalRecordId,
        sourceUrl: item.sourceUrl ?? null,
        publishedAt: null,
        fetchedAt: now().toISOString(),
        contentType: "text/html",
        parserVersion: PROCONTRACT_PARSER_VERSION,
        payload: item.payload,
        http: {
          status: 200,
          url: item.sourceUrl ?? portal.listingUrl ?? PROCONTRACT_FETCH_POLICY.hosts[0] ?? "",
          contentType: "text/html",
        },
      };
    },

    async parse(raw) {
      const payload = raw.payload as { row?: ProcontractListingRow; detail?: ProcontractDetail | null };
      if (!payload?.row) {
        throw new IngestionError({
          message: "ProContract record is missing a listing row.",
          stage: "parse",
          code: "PROCONTRACT_ROW_INVALID",
          retryable: false,
        });
      }
      return [procontractCandidate({ sourceKey: portal.sourceKey, row: payload.row, detail: payload.detail })];
    },
  };
}

async function fetchDetail(
  row: ProcontractListingRow,
  portal: ProcontractPortal,
  http: TextHttpClient,
  pace: () => Promise<void>,
): Promise<ProcontractDetail | null> {
  if (portal.rssUrl) {
    return null;
  }
  const url = advertUrl(row.href);
  if (pathBlockedByRobots(new URL(url).pathname, portal.robotsDisallow)) {
    return null;
  }
  assertFetchable(url, portal);
  await pace();
  const response = await http.getText(url);
  return parseProcontractDetail(response.body);
}

function assertFetchable(url: string, portal: ProcontractPortal): void {
  const parsed = assertAllowedUrl(url, PROCONTRACT_FETCH_POLICY);
  if (pathBlockedByRobots(parsed.pathname, portal.robotsDisallow)) {
    throw new IngestionError({
      message: `Refusing path ${parsed.pathname}; robots.txt disallows it.`,
      stage: "fetch",
      code: "ROBOTS_DISALLOW",
      retryable: false,
    });
  }
}

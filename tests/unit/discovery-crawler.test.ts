import { describe, expect, it, vi } from "vitest";

import { IngestionError } from "@/ingestion/core/errors";
import type { TextGetResult, TextHttpClient } from "@/ingestion/core/http";
import { crawlDiscoverySource, crawlerCompliance } from "@/ingestion/discovery/crawler";
import { createMemoryDiscoveryStore } from "@/ingestion/discovery/store";
import type { DiscoveryStore } from "@/ingestion/discovery/types";

const SOURCE = {
  id: "source-1",
  sourceKey: "seed-buyer",
  name: "Buyer portal",
  baseUrl: "https://buyer.example/",
  apiUrl: null,
  enabled: true,
  reuseStatus: "TERMS_REVIEWED",
  scrapingPermitted: true,
  discoveryMethod: "HTML" as const,
  rateLimitPerMinute: 60_000,
};

function response(url: string, body: string): TextGetResult {
  return { url, status: 200, contentType: "text/html", body };
}

function fakeHttp(handler: (url: string) => TextGetResult | Promise<TextGetResult>) {
  const getText = vi.fn(async (url: string) => handler(url));
  return { http: { getText } as TextHttpClient, getText };
}

function captureStore() {
  const memory = createMemoryDiscoveryStore();
  const upserts: Array<Parameters<DiscoveryStore["upsertDiscoveredCandidate"]>[0]> = [];
  const store: DiscoveryStore = {
    ...memory,
    async upsertDiscoveredCandidate(input) {
      upserts.push(input);
      return memory.upsertDiscoveredCandidate(input);
    },
  };
  return { store, upserts };
}

const ROBOTS_ALLOW = response(
  "https://buyer.example/robots.txt",
  "User-agent: *\nAllow: /\n",
);

describe("private discovery crawler", () => {
  it("stops when robots.txt disallows the page", async () => {
    const { store, upserts } = captureStore();
    const { http, getText } = fakeHttp((url) => {
      if (url.endsWith("/robots.txt")) {
        return response(url, "User-agent: *\nDisallow: /\n");
      }
      return response(url, "<html><body>Should not fetch</body></html>");
    });

    const result = await crawlDiscoverySource({
      source: SOURCE,
      store,
      http,
      maxPages: 2,
      log: () => {},
    });

    expect(result.blocked).toBe(true);
    expect(result.blockedReason).toBe("ROBOTS_DISALLOW");
    expect(result.pagesFetched).toBe(0);
    expect(getText).toHaveBeenCalledTimes(1);
    expect(upserts[0]).toMatchObject({
      blockedReason: "ROBOTS_DISALLOW",
      discoveryChannel: "CRAWL",
    });
  });

  it.each([
    ["<html><form><input type='password'></form></html>", "LOGIN_REQUIRED"],
    ["<html><body>Please complete the CAPTCHA to continue</body></html>", "CAPTCHA"],
  ])("stops and records a block on login or CAPTCHA pages", async (body, reason) => {
    const { store, upserts } = captureStore();
    const { http } = fakeHttp((url) =>
      url.endsWith("/robots.txt") ? ROBOTS_ALLOW : response(url, body),
    );

    const result = await crawlDiscoverySource({
      source: SOURCE,
      store,
      http,
      maxPages: 2,
      log: () => {},
    });

    expect(result.blocked).toBe(true);
    expect(result.blockedReason).toBe(reason);
    expect(upserts.at(-1)).toMatchObject({ blockedReason: reason });
  });

  it("stops on HTTP 403 without bypassing", async () => {
    const { store, upserts } = captureStore();
    const { http, getText } = fakeHttp((url) => {
      if (url.endsWith("/robots.txt")) {
        return ROBOTS_ALLOW;
      }
      throw new IngestionError({
        message: "forbidden",
        stage: "fetch",
        code: "HTTP_403",
        retryable: false,
        details: { status: 403 },
      });
    });

    const result = await crawlDiscoverySource({
      source: SOURCE,
      store,
      http,
      maxPages: 2,
      log: () => {},
    });

    expect(result.blocked).toBe(true);
    expect(result.blockedReason).toBe("HTTP_403");
    expect(getText).toHaveBeenCalledTimes(2);
    expect(upserts.at(-1)).toMatchObject({ blockedReason: "HTTP_403" });
  });

  it("records procurement links as candidates without fetching them", async () => {
    const { store, upserts } = captureStore();
    const { http, getText } = fakeHttp((url) =>
      url.endsWith("/robots.txt")
        ? ROBOTS_ALLOW
        : response(
            url,
            '<html><body><a href="/tenders/rfq-1">RFQ supplier tender</a><a href="/rss.xml">RSS</a></body></html>',
          ),
    );

    const result = await crawlDiscoverySource({
      source: SOURCE,
      store,
      http,
      maxPages: 1,
      log: () => {},
    });

    expect(result.pagesFetched).toBe(1);
    expect(result.candidates).toBe(1);
    expect(getText).toHaveBeenCalledTimes(2);
    expect(upserts[0]).toMatchObject({
      normalizedUrl: "https://buyer.example/tenders/rfq-1",
      discoveryChannel: "CRAWL",
      blockedReason: null,
    });
    expect(upserts[0].rawPayload).toMatchObject({
      evidence: { fetched: false, kind: "PROCUREMENT_LINK" },
    });
  });

  it("refuses disabled, UNKNOWN and prohibited sources before fetching", () => {
    expect(
      crawlerCompliance({ enabled: false, reuseStatus: "TERMS_REVIEWED", scrapingPermitted: true }),
    ).toBe("SOURCE_DISABLED");
    expect(
      crawlerCompliance({ enabled: true, reuseStatus: "UNKNOWN", scrapingPermitted: true }),
    ).toBe("REUSE_UNKNOWN");
    expect(
      crawlerCompliance({ enabled: true, reuseStatus: "PROHIBITED", scrapingPermitted: true }),
    ).toBe("REUSE_PROHIBITED");
    expect(
      crawlerCompliance({ enabled: true, reuseStatus: "TERMS_REVIEWED", scrapingPermitted: false }),
    ).toBe("SCRAPING_NOT_PERMITTED");
  });
});

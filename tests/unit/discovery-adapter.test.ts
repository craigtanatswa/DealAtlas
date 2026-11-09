import { describe, expect, it } from "vitest";

import { assertDiscoverySourceAllowed, createDiscoverySourceAdapter } from "@/ingestion/discovery/adapter";
import type { DiscoverySourceConfig } from "@/ingestion/discovery/types";

const SOURCE: DiscoverySourceConfig = {
  id: "source-1",
  sourceKey: "private-example",
  name: "Private Example",
  baseUrl: "https://example.com",
  apiUrl: null,
  accessMethod: "HTML",
  reuseStatus: "OPEN_LICENSE",
  scrapingPermitted: true,
  discoveryMethod: "RSS",
  parserType: null,
  parserConfig: { feedUrl: "https://example.com/feed.xml" },
  rateLimitPerMinute: 10,
  autoPublish: false,
  autoPublishMinConfidence: 90,
};

function httpWith(routes: Record<string, { status?: number; body: string }>) {
  return {
    async getText(url: string) {
      const route = routes[url];
      if (!route) {
        throw new Error(`Unexpected URL ${url}`);
      }
      return {
        url,
        status: route.status ?? 200,
        contentType: "text/html",
        body: route.body,
      };
    },
  };
}

describe("discovery adapter", () => {
  it("refuses UNKNOWN, PROHIBITED and non-permitted sources", () => {
    expect(() =>
      assertDiscoverySourceAllowed({
        sourceKey: "unknown",
        reuseStatus: "UNKNOWN",
        scrapingPermitted: true,
      }),
    ).toThrow(/UNKNOWN/);
    expect(() =>
      assertDiscoverySourceAllowed({
        sourceKey: "prohibited",
        reuseStatus: "PROHIBITED",
        scrapingPermitted: true,
      }),
    ).toThrow(/PROHIBITED/);
    expect(() =>
      assertDiscoverySourceAllowed({
        sourceKey: "no-scrape",
        reuseStatus: "OPEN_LICENSE",
        scrapingPermitted: false,
      }),
    ).toThrow(/scraping_permitted/);
  });

  it("discovers RSS items and fetches their detail pages", async () => {
    const http = httpWith({
      "https://example.com/robots.txt": { body: "User-agent: *\nAllow: /" },
      "https://example.com/feed.xml": {
        body: `<rss><channel>
          <item><title>RFQ grounds maintenance</title><link>https://example.com/tender/1?utm_source=rss</link><description>Seeking suppliers</description></item>
        </channel></rss>`,
      },
      "https://example.com/tender/1": {
        body: `<html><head><title>RFQ grounds maintenance</title></head><body><main><h1>RFQ grounds maintenance</h1><p>Submit a quotation by 30 June 2026.</p></main></body></html>`,
      },
    });
    const adapter = createDiscoverySourceAdapter(SOURCE, { http });

    const listing = await adapter.discover(undefined, 10);
    expect(listing.items).toHaveLength(1);
    expect(listing.items[0]?.url).toBe("https://example.com/tender/1");

    const page = await adapter.fetch(listing.items[0]!);
    expect(page.title).toContain("RFQ grounds maintenance");
    expect(page.text).toContain("Submit a quotation");
  });

  it("refuses non-HTTPS discovery URLs", () => {
    expect(() =>
      createDiscoverySourceAdapter({
        ...SOURCE,
        parserConfig: { feedUrl: "http://example.com/feed.xml" },
      }),
    ).toThrow(/HTTPS/);
  });
});

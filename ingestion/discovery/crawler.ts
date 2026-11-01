import { load } from "cheerio";

import { IngestionError } from "@/ingestion/core/errors";
import { contentHash } from "@/ingestion/core/hash";
import {
  createAllowlistedTextClient,
  type TextHttpClient,
} from "@/ingestion/core/http";
import { assertRobotsAllow } from "@/ingestion/core/robots";
import { domainFromCandidateUrl, normalizeCandidateUrl } from "@/ingestion/discovery/dedupe";
import type {
  DiscoveryMethod,
  DiscoveryStore,
} from "@/ingestion/discovery/types";
import {
  errorMessage,
  structuredLog,
  type LogEvent,
} from "@/lib/observability/log";

export type CrawlerSource = {
  id: string;
  sourceKey: string;
  name: string;
  baseUrl: string | null;
  apiUrl: string | null;
  enabled: boolean;
  reuseStatus: string;
  scrapingPermitted: boolean;
  discoveryMethod: DiscoveryMethod | null;
  rateLimitPerMinute: number | null;
};

export type CrawlResult = {
  sourceKey: string;
  pagesFetched: number;
  candidates: number;
  errors: number;
  blocked: boolean;
  blockedReason: string | null;
  candidatesStored: string[];
};

type CrawlLink = {
  url: string;
  title: string | null;
  kind: "PROCUREMENT_LINK" | "RSS";
  evidence: string;
  feedUrl: string | null;
};

const PROCUREMENT_LINK =
  /\b(supplier|procurement|tender|tenders|rfq|rfp|itt|itq|opportunit(?:y|ies)|framework|contract|contracts|quote|quotation|bid|bids|eoi|sourcing|portal|pqq|dps)\b/i;

const RSS_LINK = /(?:^|[/._-])(rss|feed|atom)(?:[/._-]|$)|\.rss(?:$|\?)|[?&]format=rss/i;
const SITEMAP_PATH = /\/sitemap(?:[_-][a-z0-9-]+)?\.xml(?:$|\?)/i;

export async function crawlDiscoverySource(input: {
  source: CrawlerSource;
  store: DiscoveryStore;
  http?: TextHttpClient;
  maxPages?: number;
  rateLimitPerMinute?: number | null;
  sleep?: (ms: number) => Promise<void>;
  log?: (event: LogEvent) => void;
}): Promise<CrawlResult> {
  const result: CrawlResult = {
    sourceKey: input.source.sourceKey,
    pagesFetched: 0,
    candidates: 0,
    errors: 0,
    blocked: false,
    blockedReason: null,
    candidatesStored: [],
  };
  const compliance = crawlerCompliance(input.source);
  if (compliance) {
    result.blocked = true;
    result.blockedReason = compliance;
    return result;
  }

  const baseUrl = normalizeCandidateUrl(input.source.baseUrl ?? input.source.apiUrl ?? "");
  if (!baseUrl) {
    result.errors += 1;
    result.blockedReason = "INVALID_BASE_URL";
    return result;
  }
  const base = new URL(baseUrl);
  if (base.protocol !== "https:") {
    result.blocked = true;
    result.blockedReason = "HTTPS_REQUIRED";
    return result;
  }

  const http =
    input.http ??
    createAllowlistedTextClient(
      { protocol: "https:", hosts: [base.hostname], pathPrefixes: ["/"] },
      { timeoutMs: 30_000 },
    );
  const sleep =
    input.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxPages = Math.min(50, Math.max(1, input.maxPages ?? 10));
  const rateLimit = input.rateLimitPerMinute ?? input.source.rateLimitPerMinute ?? 30;
  const delayMs = rateLimit > 0 ? Math.ceil(60_000 / Math.max(1, rateLimit)) : 0;
  const log = input.log ?? structuredLog;
  const seen = new Set<string>();
  const seenCandidates = new Set<string>();
  const queue = uniqueUrls([
    baseUrl,
    new URL("/sitemap.xml", base).toString(),
  ]);
  const fetched = new Set<string>();

  const recordBlocked = async (url: string, reason: string, title: string | null) => {
    const normalizedUrl = normalizeCandidateUrl(url);
    if (!normalizedUrl) {
      return;
    }
    await input.store.upsertDiscoveredCandidate({
      sourceId: input.source.id,
      url,
      normalizedUrl,
      domain: domainFromCandidateUrl(normalizedUrl),
      title,
      publishedAt: null,
      status: "REJECTED",
      confidence: 0,
      matchedKeywords: [],
      contentHash: contentHash({ url: normalizedUrl, reason }),
      rawPayload: {
        evidence: { pageUrl: url, reason, fetched: false },
      },
      discoveryChannel: "CRAWL",
      blockedReason: reason,
    });
    result.blocked = true;
    result.blockedReason = reason;
  };

  while (queue.length > 0 && result.pagesFetched < maxPages) {
    const url = queue.shift();
    if (!url || fetched.has(url) || seen.has(url)) {
      continue;
    }
    seen.add(url);
    if (result.pagesFetched > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      const path = new URL(url).pathname || "/";
      await assertRobotsAllow({
        http,
        robotsUrl: `https://${base.hostname}/robots.txt`,
        path,
        sourceLabel: input.source.name,
      });
      const response = await http.getText(url);
      result.pagesFetched += 1;
      fetched.add(url);

      const blocked = detectBlockedPage(response.body);
      if (blocked) {
        await recordBlocked(response.url || url, blocked, null);
        break;
      }

      const finalUrl = response.url || url;
      if (looksLikeFeed(response.body, finalUrl)) {
        for (const item of extractRssItems(response.body, finalUrl)) {
          if (!PROCUREMENT_LINK.test(`${item.title ?? ""} ${item.url}`)) {
            continue;
          }
          await recordCandidate(item.url, item.title, "RSS_ITEM", finalUrl);
        }
      }
      const links = extractLinks(response.body, finalUrl);
      for (const link of links) {
        if (link.kind === "RSS") {
          if (
            !SITEMAP_PATH.test(link.url) &&
            !seen.has(link.url) &&
            !fetched.has(link.url) &&
            queue.length + result.pagesFetched < maxPages
          ) {
            queue.push(link.url);
          }
          continue;
        }
        await recordCandidate(
          link.url,
          link.title,
          "PROCUREMENT_LINK",
          finalUrl,
        );
      }
    } catch (error) {
      if (isSitemapMissing(url, error)) {
        continue;
      }
      const blockedReason = blockedReasonFromError(error);
      if (blockedReason) {
        await recordBlocked(url, blockedReason, null);
        break;
      }
      result.errors += 1;
      log({
        job: "discover",
        msg: "crawl_page_failed",
        level: "warn",
        sourceKey: input.source.sourceKey,
        url,
        error: errorMessage(error),
      });
    }
  }

  async function recordCandidate(
    rawUrl: string,
    title: string | null,
    kind: CrawlLink["kind"] | "RSS_ITEM",
    pageUrl: string,
  ) {
    const normalizedUrl = normalizeCandidateUrl(rawUrl, pageUrl);
    if (!normalizedUrl || seenCandidates.has(normalizedUrl)) {
      return;
    }
    seenCandidates.add(normalizedUrl);
    const stored = await input.store.upsertDiscoveredCandidate({
      sourceId: input.source.id,
      url: rawUrl,
      normalizedUrl,
      domain: domainFromCandidateUrl(normalizedUrl),
      title,
      publishedAt: null,
      status: "PENDING_REVIEW",
      confidence: kind === "RSS_ITEM" ? 55 : 50,
      matchedKeywords: matchedKeywords(`${title ?? ""} ${normalizedUrl}`),
      contentHash: contentHash({ url: normalizedUrl, title }),
      rawPayload: {
        evidence: {
          pageUrl,
          linkText: title,
          kind,
          fetched: false,
        },
      },
      discoveryChannel: "CRAWL",
      blockedReason: null,
    });
    result.candidates += 1;
    result.candidatesStored.push(stored.id);
  }

  await input.store.recordSourceRun({
    sourceId: input.source.id,
    discovered: result.candidates,
    opportunities: 0,
    rejected: result.blocked ? 1 : 0,
    duplicates: 0,
    errors: result.errors + (result.blocked ? 1 : 0),
    lastError: result.blockedReason,
  });

  log({
    job: "discover",
    msg: "crawl_finished",
    sourceKey: input.source.sourceKey,
    pagesFetched: result.pagesFetched,
    candidates: result.candidates,
    errors: result.errors,
    blocked: result.blocked,
    blockedReason: result.blockedReason,
  });
  return result;
}

export function crawlerCompliance(source: {
  enabled: boolean;
  reuseStatus: string;
  scrapingPermitted: boolean;
}): string | null {
  if (!source.enabled) {
    return "SOURCE_DISABLED";
  }
  if (source.reuseStatus === "UNKNOWN") {
    return "REUSE_UNKNOWN";
  }
  if (source.reuseStatus === "PROHIBITED") {
    return "REUSE_PROHIBITED";
  }
  if (!source.scrapingPermitted) {
    return "SCRAPING_NOT_PERMITTED";
  }
  return null;
}

export function detectBlockedPage(body: string): string | null {
  const head = body.slice(0, 30_000);
  const lower = head.toLowerCase();
  if (/<input[^>]+type\s*=\s*["']?password\b/i.test(head)) {
    return "LOGIN_REQUIRED";
  }
  if (
    /\b(captcha|recaptcha|hcaptcha|cf-turnstile|are you a robot|verify you are human)\b/i.test(
      lower,
    )
  ) {
    return "CAPTCHA";
  }
  if (
    /\b(subscribe to (?:read|continue|view)|already a subscriber|premium content|paywall|paid subscribers?)\b/i.test(
      lower,
    )
  ) {
    return "PAYWALL";
  }
  if (
    /<form[^>]+action\s*=\s*["'][^"']*(?:login|signin|sign-in|auth)/i.test(head) &&
    /\b(password|username|email)\b/i.test(lower)
  ) {
    return "LOGIN_REQUIRED";
  }
  return null;
}

export function extractLinks(body: string, pageUrl: string): CrawlLink[] {
  const $ = load(body, { xmlMode: /<(?:urlset|sitemapindex)[\s>]/i.test(body) });
  const links: CrawlLink[] = [];
  const seen = new Set<string>();

  $("a[href], link[href], loc").each((_, node) => {
    const element = $(node);
    const raw = element.attr("href") ?? element.text().trim();
    const url = normalizeCandidateUrl(raw, pageUrl);
    if (!url || seen.has(url)) {
      return;
    }
    const title = element.text().replace(/\s+/g, " ").trim() || null;
    const rel = element.attr("rel") ?? "";
    const type = element.attr("type") ?? "";
    const isRss = /(?:alternate|feed)/i.test(rel) && /rss|atom|xml/i.test(type)
      ? true
      : RSS_LINK.test(url);
    if (isRss) {
      seen.add(url);
      links.push({ url, title, kind: "RSS", evidence: "feed link", feedUrl: null });
      return;
    }
    if (SITEMAP_PATH.test(url)) {
      return;
    }
    const haystack = `${title ?? ""} ${url}`;
    if (!PROCUREMENT_LINK.test(haystack)) {
      return;
    }
    seen.add(url);
    links.push({
      url,
      title,
      kind: "PROCUREMENT_LINK",
      evidence: matchedKeywords(haystack).join(", ") || "procurement link",
      feedUrl: null,
    });
  });

  return links;
}

export function extractRssItems(
  body: string,
  pageUrl: string,
): Array<{ url: string; title: string | null }> {
  const $ = load(body, { xmlMode: true });
  const items: Array<{ url: string; title: string | null }> = [];
  $("item, entry").each((_, node) => {
    const element = $(node);
    const title = element.find("title").first().text().replace(/\s+/g, " ").trim() || null;
    const raw =
      element.find("link").first().text().trim() ||
      element.find("link").first().attr("href") ||
      element.find("guid").first().text().trim();
    const url = normalizeCandidateUrl(raw, pageUrl);
    if (url) {
      items.push({ url, title });
    }
  });
  return items.slice(0, 100);
}

function looksLikeFeed(body: string, url: string): boolean {
  return (
    RSS_LINK.test(url) ||
    /<rss[\s>]|<feed[\s>]|<rdf:RDF[\s>]/i.test(body.slice(0, 4_000))
  );
}

function matchedKeywords(text: string): string[] {
  const matches = text.match(
    /\b(rfq|rfp|itt|itq|eoi|supplier|procurement|tender|framework|contract|quotation|bid|sourcing|portal|pqq|dps)\b/gi,
  );
  return [...new Set((matches ?? []).map((item) => item.toLowerCase()))];
}

function blockedReasonFromError(error: unknown): string | null {
  if (!(error instanceof IngestionError)) {
    return null;
  }
  const status = error.details.status;
  if (status === 401 || status === 403 || status === 429) {
    return `HTTP_${status}`;
  }
  if (error.code === "HTTP_401" || error.code === "HTTP_403" || error.code === "HTTP_429") {
    return error.code;
  }
  if (error.code === "ROBOTS_DISALLOW") {
    return "ROBOTS_DISALLOW";
  }
  if (error.code === "URL_HOST_DENIED" || error.code === "URL_PATH_DENIED") {
    return "CRAWL_SCOPE_DENIED";
  }
  return null;
}

function isSitemapMissing(url: string, error: unknown): boolean {
  if (!SITEMAP_PATH.test(url) || !(error instanceof IngestionError)) {
    return false;
  }
  return error.code === "HTTP_404" || error.code === "HTTP_410";
}

function uniqueUrls(values: string[]): string[] {
  return [...new Set(values)];
}

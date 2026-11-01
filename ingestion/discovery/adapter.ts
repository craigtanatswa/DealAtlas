import { load } from "cheerio";

import { IngestionError } from "@/ingestion/core/errors";
import {
  createAllowlistedTextClient,
  type AllowedFetchPolicy,
  type TextHttpClient,
} from "@/ingestion/core/http";
import { assertRobotsAllow } from "@/ingestion/core/robots";
import { withRetry } from "@/ingestion/core/retry";
import { normalizeCandidateUrl } from "@/ingestion/discovery/dedupe";
import type {
  DiscoveryAdapter,
  DiscoveryListItem,
  DiscoveryPage,
  DiscoverySourceConfig,
} from "@/ingestion/discovery/types";

type ParserConfig = {
  listUrl?: string;
  feedUrl?: string;
  itemsPath?: string;
  listSelector?: string;
  linkSelector?: string;
  titleSelector?: string;
  summarySelector?: string;
  dateSelector?: string;
  contentSelector?: string;
  titleField?: string;
  urlField?: string;
  summaryField?: string;
  dateField?: string;
  detail?: boolean;
};

export type DiscoveryAdapterOptions = {
  http?: TextHttpClient;
  timeoutMs?: number;
};

export function assertDiscoverySourceAllowed(source: {
  sourceKey: string;
  reuseStatus: string;
  scrapingPermitted: boolean;
}): void {
  if (source.reuseStatus === "UNKNOWN") {
    throw new IngestionError({
      message: `Discovery source ${source.sourceKey} cannot be crawled while reuse status is UNKNOWN.`,
      stage: "compliance",
      code: "REUSE_UNKNOWN",
      retryable: false,
    });
  }
  if (source.reuseStatus === "PROHIBITED") {
    throw new IngestionError({
      message: `Discovery source ${source.sourceKey} is marked PROHIBITED.`,
      stage: "compliance",
      code: "REUSE_PROHIBITED",
      retryable: false,
    });
  }
  if (!source.scrapingPermitted) {
    throw new IngestionError({
      message: `Discovery source ${source.sourceKey} cannot be crawled until scraping_permitted=true.`,
      stage: "compliance",
      code: "SCRAPING_NOT_PERMITTED",
      retryable: false,
    });
  }
}

export function createDiscoverySourceAdapter(
  source: DiscoverySourceConfig,
  options: DiscoveryAdapterOptions = {},
): DiscoveryAdapter {
  assertDiscoverySourceAllowed({
    sourceKey: source.sourceKey,
    reuseStatus: source.reuseStatus,
    scrapingPermitted: source.scrapingPermitted,
  });
  if (!source.discoveryMethod) {
    throw new IngestionError({
      message: `Source ${source.sourceKey} has no discovery method.`,
      stage: "discover",
      code: "DISCOVERY_METHOD_MISSING",
      retryable: false,
    });
  }

  const config = source.parserConfig as ParserConfig;
  const listUrl =
    config.listUrl ??
    config.feedUrl ??
    source.apiUrl ??
    source.baseUrl;
  if (!listUrl) {
    throw new IngestionError({
      message: `Source ${source.sourceKey} has no discovery URL.`,
      stage: "discover",
      code: "DISCOVERY_URL_MISSING",
      retryable: false,
    });
  }

  const parsed = new URL(listUrl);
  if (parsed.protocol !== "https:") {
    throw new IngestionError({
      message: `Discovery source ${source.sourceKey} must use HTTPS.`,
      stage: "discover",
      code: "DISCOVERY_HTTPS_REQUIRED",
      retryable: false,
    });
  }
  const policy: AllowedFetchPolicy = {
    protocol: "https:",
    hosts: [parsed.hostname],
    pathPrefixes: ["/"],
  };
  const http =
    options.http ??
    createAllowlistedTextClient(policy, { timeoutMs: options.timeoutMs ?? 30_000 });
  let robotsChecked = false;

  async function checkRobots(url: string) {
    if (robotsChecked) {
      return;
    }
    await assertRobotsAllow({
      http,
      robotsUrl: `https://${parsed.hostname}/robots.txt`,
      path: new URL(url).pathname || "/",
      sourceLabel: source.name,
    });
    robotsChecked = true;
  }

  async function fetchPage(url: string): Promise<DiscoveryPage> {
    await checkRobots(url);
    const response = await withRetry(() => http.getText(url));
    const page = extractPage(response.body, response.url, source.discoveryMethod, config);
    return {
      ...page,
      publishedAt: page.publishedAt ?? null,
    };
  }

  return {
    sourceKey: source.sourceKey,
    method: source.discoveryMethod,

    async discover(cursor) {
      await checkRobots(listUrl);
      const response = await withRetry(() => http.getText(listUrl));
      const items = extractItems(
        response.body,
        response.url || listUrl,
        source.discoveryMethod,
        config,
      );
      const offset = Number.parseInt(cursor ?? "0", 10) || 0;
      const page = items.slice(offset, offset + Math.min(100, Math.max(1, 50)));
      const nextOffset = offset + page.length;
      return {
        items: page,
        nextCursor: nextOffset < items.length && page.length > 0 ? String(nextOffset) : undefined,
      };
    },

    async fetch(item) {
      const url = normalizeCandidateUrl(item.url, listUrl) ?? item.url;
      if (config.detail === false && item.payload) {
        const payload = item.payload as { title?: string; text?: string; html?: string };
        return {
          url,
          title: payload.title ?? item.title ?? "",
          text: payload.text ?? "",
          html: payload.html ?? null,
          publishedAt: item.publishedAt ?? null,
        };
      }
      return fetchPage(url);
    },
  };
}

function extractItems(
  body: string,
  listUrl: string,
  method: DiscoverySourceConfig["discoveryMethod"],
  config: ParserConfig,
): DiscoveryListItem[] {
  if (method === "JSON") {
    return jsonItems(body, listUrl, config);
  }
  if (method === "RSS") {
    return rssItems(body, listUrl, config);
  }
  return htmlItems(body, listUrl, config);
}

function rssItems(
  body: string,
  listUrl: string,
  config: ParserConfig,
): DiscoveryListItem[] {
  const $ = load(body, { xmlMode: true });
  const items: DiscoveryListItem[] = [];
  $("item, entry").each((_, node) => {
    const element = $(node);
    const title = textOf(element, "title");
    const rawUrl =
      element.find("link").first().text().trim() ||
      element.find("link").first().attr("href") ||
      element.find("guid").first().text().trim() ||
      element.find("id").first().text().trim();
    const url = normalizeCandidateUrl(rawUrl, listUrl);
    if (!url) {
      return;
    }
    items.push({
      url,
      title,
      summary:
        textOf(element, "description") ??
        textOf(element, "summary") ??
        textOf(element, "content"),
      publishedAt:
        textOf(element, "pubDate") ??
        textOf(element, "published") ??
        textOf(element, "updated"),
    });
  });
  return items.slice(0, config.detail === false ? 100 : 1000);
}

function htmlItems(
  body: string,
  listUrl: string,
  config: ParserConfig,
): DiscoveryListItem[] {
  const $ = load(body);
  const rowSelector = config.listSelector ?? "article, li, .opportunity, .notice";
  const linkSelector = config.linkSelector ?? "a[href]";
  const items: DiscoveryListItem[] = [];
  $(rowSelector).each((_, node) => {
    const row = $(node);
    const link = row.find(linkSelector).first();
    const href = link.attr("href");
    const url = href ? normalizeCandidateUrl(href, listUrl) : null;
    if (!url) {
      return;
    }
    items.push({
      url,
      title: (config.titleSelector ? row.find(config.titleSelector).first().text() : link.text()).trim(),
      summary: config.summarySelector
        ? row.find(config.summarySelector).first().text().replace(/\s+/g, " ").trim()
        : null,
      publishedAt: config.dateSelector
        ? row.find(config.dateSelector).first().text().trim()
        : null,
    });
  });
  return items;
}

function jsonItems(
  body: string,
  listUrl: string,
  config: ParserConfig,
): DiscoveryListItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new IngestionError({
      message: "Discovery JSON source returned invalid JSON.",
      stage: "discover",
      code: "DISCOVERY_JSON_INVALID",
      retryable: false,
    });
  }
  const selected = readPath(parsed, config.itemsPath);
  const records = Array.isArray(selected) ? selected : Array.isArray(parsed) ? parsed : [];
  const items: DiscoveryListItem[] = [];
  for (const record of records) {
    if (!record || typeof record !== "object") {
      continue;
    }
    const row = record as Record<string, unknown>;
    const rawUrl = stringValue(row[config.urlField ?? "url"]);
    const url = rawUrl ? normalizeCandidateUrl(rawUrl, listUrl) : null;
    if (!url) {
      continue;
    }
    items.push({
      url,
      title: stringValue(row[config.titleField ?? "title"]),
      summary: stringValue(row[config.summaryField ?? "summary"]),
      publishedAt: stringValue(row[config.dateField ?? "date"]),
      payload: row,
    });
  }
  return items;
}

function extractPage(
  body: string,
  url: string,
  method: DiscoverySourceConfig["discoveryMethod"],
  config: ParserConfig,
): DiscoveryPage {
  if (method === "JSON") {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const title = stringValue(parsed[config.titleField ?? "title"]) ?? "";
      const text =
        stringValue(parsed[config.summaryField ?? "summary"]) ??
        stringValue(parsed.description) ??
        body;
      return { url, title, text, html: null };
    } catch {
      return { url, title: "", text: body, html: null };
    }
  }
  const $ = load(body);
  $("script, style, noscript, nav, footer, header, form").remove();
  const title =
    (config.titleSelector ? $(config.titleSelector).first().text() : "") ||
    $("h1").first().text() ||
    $("title").first().text() ||
    "";
  const selected = config.contentSelector
    ? $(config.contentSelector).first()
    : null;
  const content =
    selected && selected.length > 0
      ? selected
      : $("main").first().length > 0
        ? $("main").first()
        : $("article").first().length > 0
          ? $("article").first()
          : $("body");
  const text = content.text().replace(/\s+/g, " ").trim() || body;
  return {
    url,
    title: title.replace(/\s+/g, " ").trim(),
    text,
    html: body,
  };
}

type TextSelection = {
  find(selector: string): { first(): { text(): string } };
};

function textOf(element: TextSelection, selector: string): string | null {
  const text = element.find(selector).first().text().replace(/\s+/g, " ").trim();
  return text || null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPath(value: unknown, path: string | undefined): unknown {
  if (!path) {
    return value;
  }
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return null;
  }, value);
}

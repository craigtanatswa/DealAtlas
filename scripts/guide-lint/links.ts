import { parseMarkdown, type Block } from "@/lib/guides/markdown";

import { findLinks, proseLines } from "./source";
import { routeExists } from "./routes";
import type { GuideLintContext, GuideLintFailure, SourceLine } from "./types";

/** Hosts a guide may link to, matched exactly. */
export const ALLOWED_HOSTS = new Set([
  "www.gov.uk",
  "www.legislation.gov.uk",
  "www.finance-ni.gov.uk",
  "www.gov.scot",
  "www.gov.wales",
]);

/** Source platforms: allowed unless the path points at a notice or procurement. */
export const SOURCE_PLATFORM_HOSTS = new Set([
  "www.find-tender.service.gov.uk",
  "www.contractsfinder.service.gov.uk",
]);

/** A source-platform link fails only when its path or query contains one of these. */
export const SOURCE_PATH_FORBIDDEN = ["/Notice/", "/notice/", "/Procurement/", "ocds-"];

/** True for an https link to an allowed host (a source-platform link must also avoid notice paths). */
export function isAllowedOutbound(href: string): boolean {
  if (!/^https:\/\//i.test(href)) return false;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host)) return true;
  if (!SOURCE_PLATFORM_HOSTS.has(host)) return false;
  const full = `${url.pathname}${url.search}`;
  return !SOURCE_PATH_FORBIDDEN.some((part) => full.includes(part));
}

function headingIds(body: SourceLine[]): Set<string> {
  const blocks: Block[] = parseMarkdown(body.map((line) => line.text).join("\n"));
  return new Set(
    blocks.flatMap((block) => (block.type === "heading" ? [block.id] : [])),
  );
}

export function lintLinks(file: string, body: SourceLine[], ctx: GuideLintContext): GuideLintFailure[] {
  const failures: GuideLintFailure[] = [];
  const fail = (line: number, rule: string, message: string) =>
    failures.push({ file, line, rule, message });
  const ids = headingIds(body);

  for (const link of findLinks(proseLines(body))) {
    const href = link.href.trim();

    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") || /^www\./i.test(href)) {
      if (!/^https:\/\//i.test(href)) {
        fail(link.line, "link-https", `outbound link must use https: ${href}`);
        continue;
      }
      let url: URL;
      try {
        url = new URL(href);
      } catch {
        fail(link.line, "link-https", `outbound link is not a valid URL: ${href}`);
        continue;
      }
      const host = url.hostname.toLowerCase();
      if (url.port || url.username || url.password) {
        fail(link.line, "link-host", `outbound link has a port or credentials: ${href}`);
        continue;
      }
      if (ALLOWED_HOSTS.has(host)) continue;
      if (SOURCE_PLATFORM_HOSTS.has(host)) {
        const full = `${url.pathname}${url.search}`;
        const forbidden = SOURCE_PATH_FORBIDDEN.find((part) => full.includes(part));
        if (forbidden) {
          fail(link.line, "link-source-path", `${host} link points at a notice (${forbidden}): ${href}`);
        }
        continue;
      }
      fail(link.line, "link-host", `outbound host is not allowed: ${host}`);
      continue;
    }

    if (href.startsWith("#")) {
      if (!ids.has(href.slice(1))) {
        fail(link.line, "link-internal-route", `anchor does not match a heading: ${href}`);
      }
      continue;
    }

    if (!href.startsWith("/")) {
      fail(link.line, "link-internal-relative", `internal link must be a root-relative path: ${href}`);
      continue;
    }

    const pathname = href.split(/[?#]/)[0] || "/";
    if (/^\/deals\/[^/]+/.test(pathname)) {
      fail(link.line, "link-deals-slug", `guides must not link to a deal preview: ${pathname}`);
      continue;
    }
    if (!routeExists(ctx.routes, pathname)) {
      fail(link.line, "link-internal-route", `internal link is not an app route or published guide: ${pathname}`);
    }
  }
  return failures;
}

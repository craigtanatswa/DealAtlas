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

/** Source platforms: only the root page or a search page, never a notice. */
export const SOURCE_PLATFORM_HOSTS = new Set([
  "www.find-tender.service.gov.uk",
  "www.contractsfinder.service.gov.uk",
]);

const SOURCE_PATH_FORBIDDEN = ["/Notice/", "/notice/", "/Procurement/", "ocds-"];

function isSourceRootOrSearch(url: URL): boolean {
  const pathname = url.pathname.replace(/\/+$/, "");
  if (pathname === "") return true;
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return first.toLowerCase() === "search";
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
        } else if (!isSourceRootOrSearch(url)) {
          fail(link.line, "link-source-path", `${host} link must be the root or a search page: ${href}`);
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

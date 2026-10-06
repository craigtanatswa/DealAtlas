import { structuredLog } from "@/lib/observability/log";
import { compileTokens, scanText, type ManifestToken } from "@/tests/leak/lib/scan";

import type { LeakFindingReport } from "@/lib/leak-scan/report";
import type { LegacySlug } from "@/lib/leak-scan/state";

export const PUBLIC_ORIGIN = "https://www.dealatlas.uk";
export const HTTP_SAMPLE_LIMIT = 15;
const SITEMAP_CHILD_LIMIT = 2;
const LEGACY_PROBE_LIMIT = 20;

export type OldSlugStatus =
  | { status: "skipped"; reason: "db_pass_unavailable" | "no_legacy_slugs" }
  | { status: "checked"; count: number };

export type HttpPassResult = {
  findings: LeakFindingReport[];
  oldSlugs: OldSlugStatus;
  fetched: number;
};

type Fetched = { status: number; body: string; contentType: string };

async function fetchPublic(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<Fetched> {
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "manual",
    headers: { "accept-encoding": "identity", ...headers },
    signal: AbortSignal.timeout(15_000),
  });
  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get("content-type") ?? "",
  };
}

function sameOrigin(origin: string, value: string): string | null {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function locs(xml: string, origin: string): string[] {
  const found: string[] = [];
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
    const url = sameOrigin(origin, match[1].trim());
    if (url) found.push(url);
  }
  return found;
}

function dealPaths(urls: string[], origin: string): string[] {
  const paths: string[] = [];
  for (const url of urls) {
    const parsed = new URL(url);
    if (parsed.origin !== origin) continue;
    if (!/^\/deals\/[^/]+$/.test(parsed.pathname) || parsed.pathname.includes("sitemap")) continue;
    paths.push(parsed.pathname);
  }
  return [...new Set(paths)];
}

function hitsFor(body: string, contentType: string, compiled: ReturnType<typeof compileTokens>, path: string): LeakFindingReport[] {
  if (!compiled.length || !body) return [];
  const scanned = scanText(body, compiled, contentType);
  const findings: LeakFindingReport[] = [];
  for (const tokenScan of scanned.tokens.values()) {
    const compiledToken = compiled.find((entry) => entry.token.id === tokenScan.tokenId);
    const dealId = compiledToken?.token.rows[0];
    if (!dealId) continue;
    findings.push({ dealId, code: tokenScan.tokenClass, path });
  }
  return findings;
}

export async function runHttpPass(options: {
  origin?: string;
  fetchImpl?: typeof fetch;
  tokens?: ManifestToken[];
  legacySlugs?: LegacySlug[] | null;
  sampleLimit?: number;
}): Promise<HttpPassResult> {
  const origin = (options.origin ?? PUBLIC_ORIGIN).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const compiled = compileTokens({ version: 1, controls_alphabet: "qxjzvbnm", date_tokens_iso: [], yearless_date_tokens: [], rows: {}, orgs: {}, tokens: options.tokens ?? [] });
  const findings: LeakFindingReport[] = [];
  let fetched = 0;

  const pull = async (path: string, headers: Record<string, string> = {}) => {
    const page = await fetchPublic(`${origin}${path}`, headers, fetchImpl);
    fetched += 1;
    if (page.status === 200) {
      findings.push(...hitsFor(page.body, page.contentType, compiled, path.split("?")[0] || path));
    }
    return page;
  };

  const index = await pull("/sitemap.xml");
  const dealsIndex = await pull("/deals/sitemap.xml");
  const children = [...locs(index.body, origin), ...locs(dealsIndex.body, origin)]
    .filter((url) => url.includes("/sitemap"))
    .slice(0, SITEMAP_CHILD_LIMIT);
  const dealUrls: string[] = [];
  for (const child of children) {
    const parsed = new URL(child);
    const page = await pull(`${parsed.pathname}${parsed.search}`);
    dealUrls.push(...locs(page.body, origin));
  }
  await pull("/");
  await pull("/deals");
  const sample = dealPaths(dealUrls, origin).slice(0, options.sampleLimit ?? HTTP_SAMPLE_LIMIT);
  for (const path of sample) {
    await pull(path);
    await pull(`${path}?_rsc=1`, { rsc: "1", accept: "text/x-component" });
  }
  await pull("/api/search?limit=20");

  let oldSlugs: OldSlugStatus;
  if (options.legacySlugs == null) {
    oldSlugs = { status: "skipped", reason: "db_pass_unavailable" };
    structuredLog({ msg: "leak_scan_old_slug_skipped", reason: "db_pass_unavailable" });
  } else if (options.legacySlugs.length === 0) {
    oldSlugs = { status: "skipped", reason: "no_legacy_slugs" };
    structuredLog({ msg: "leak_scan_old_slug_skipped", reason: "no_legacy_slugs" });
  } else {
    const probes = options.legacySlugs.slice(0, LEGACY_PROBE_LIMIT);
    for (const legacy of probes) {
      const path = `/deals/${legacy.slug}`;
      const page = await fetchPublic(`${origin}${path}`, {}, fetchImpl);
      fetched += 1;
      if (page.status !== 410 && page.status !== 404) {
        findings.push({ dealId: legacy.dealId, code: "OLD_SLUG", path });
      }
    }
    oldSlugs = { status: "checked", count: probes.length };
  }

  structuredLog({ msg: "leak_scan_http", fetched, findings: findings.length });
  return { findings, oldSlugs, fetched };
}

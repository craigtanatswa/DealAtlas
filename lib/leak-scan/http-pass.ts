import { structuredLog } from "@/lib/observability/log";
import { codeCounts, type LeakFindingReport } from "@/lib/leak-scan/report";
import type { DealTokenSet, LegacySlug } from "@/lib/leak-scan/state";
import { compileTokens, heuristicHits, scanText, type ManifestToken } from "@/tests/leak/lib/scan";

export const PUBLIC_ORIGIN = "https://www.dealatlas.uk";
export const HTTP_SAMPLE_LIMIT = 15;
const SITEMAP_CHILD_LIMIT = 2;
const LEGACY_PROBE_LIMIT = 20;

/** Harness report heuristics that are identifier-shaped. Matched text is not kept. */
const GLOBAL_FORBIDDEN = ["portal_name", "ocid_shape", "email", "uk_phone", "gov_domain", "reference_shape"] as const;

export type OldSlugStatus =
  | { status: "skipped"; reason: "db_pass_unavailable" | "no_legacy_slugs" }
  | { status: "checked"; count: number };

export type HttpPassResult = {
  findings: LeakFindingReport[];
  oldSlugs: OldSlugStatus;
  fetched: number;
  sampleOffset: number;
};

type Fetched = { status: number; body: string; contentType: string };

export function rotatingSample<T>(items: T[], limit: number, seed: number): { picked: T[]; offset: number } {
  if (items.length === 0 || limit <= 0) return { picked: [], offset: 0 };
  if (items.length <= limit) return { picked: items, offset: 0 };
  const offset = ((seed % items.length) + items.length) % items.length;
  const picked: T[] = [];
  for (let i = 0; i < limit; i += 1) picked.push(items[(offset + i) % items.length]);
  return { picked, offset };
}

function manifest(tokens: ManifestToken[]) {
  return {
    version: 1,
    controls_alphabet: "qxjzvbnm",
    date_tokens_iso: [] as string[],
    yearless_date_tokens: [] as string[],
    rows: {},
    orgs: {},
    tokens,
  };
}

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

function ownFindings(body: string, contentType: string, tokens: ManifestToken[], path: string, dealId: string): LeakFindingReport[] {
  if (!tokens.length || !body) return [];
  const scanned = scanText(body, compileTokens(manifest(tokens)), contentType);
  const findings: LeakFindingReport[] = [];
  for (const tokenScan of scanned.tokens.values()) {
    findings.push({ dealId, code: tokenScan.tokenClass, path, held: false, pass: "http" });
  }
  return findings;
}

function globalFindings(body: string, path: string, dealId: string): LeakFindingReport[] {
  if (!body) return [];
  const hits = heuristicHits(body);
  const findings: LeakFindingReport[] = [];
  for (const code of GLOBAL_FORBIDDEN) {
    if ((hits[code]?.length ?? 0) > 0) {
      findings.push({ dealId, code, path, held: false, pass: "http" });
    }
  }
  return findings;
}

export async function runHttpPass(options: {
  origin?: string;
  fetchImpl?: typeof fetch;
  dealTokens?: DealTokenSet[];
  legacySlugs?: LegacySlug[] | null;
  sampleLimit?: number;
  sampleSeed?: number;
}): Promise<HttpPassResult> {
  const origin = (options.origin ?? PUBLIC_ORIGIN).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const seed = options.sampleSeed ?? Math.floor(Date.now() / 3_600_000);
  const bySlug = new Map((options.dealTokens ?? []).map((entry) => [entry.slug, entry]));
  const findings: LeakFindingReport[] = [];
  let fetched = 0;

  const note = (path: string, page: Fetched) => {
    if (page.status !== 200) return;
    const clean = path.split("?")[0] || path;
    const slug = /^\/deals\/([^/]+)$/.exec(clean)?.[1];
    const own = slug ? bySlug.get(decodeURIComponent(slug)) : undefined;
    if (own) findings.push(...ownFindings(page.body, page.contentType, own.tokens, clean, own.dealId));
    findings.push(...globalFindings(page.body, clean, own?.dealId ?? ""));
  };

  const pull = async (path: string, headers: Record<string, string> = {}) => {
    const page = await fetchPublic(`${origin}${path}`, headers, fetchImpl);
    fetched += 1;
    note(path, page);
    return page;
  };

  const index = await pull("/sitemap.xml");
  const dealsIndex = await pull("/deals/sitemap.xml");
  const childUrls = [...locs(index.body, origin), ...locs(dealsIndex.body, origin)].filter((url) => url.includes("/sitemap"));
  const children = rotatingSample(childUrls, SITEMAP_CHILD_LIMIT, seed);
  const dealUrls: string[] = [];
  for (const child of children.picked) {
    const parsed = new URL(child);
    const page = await pull(`${parsed.pathname}${parsed.search}`);
    dealUrls.push(...locs(page.body, origin));
  }
  await pull("/");
  await pull("/deals");
  const sample = rotatingSample(dealPaths(dealUrls, origin), options.sampleLimit ?? HTTP_SAMPLE_LIMIT, seed);
  for (const path of sample.picked) {
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
        findings.push({ dealId: legacy.dealId, code: "OLD_SLUG", path, held: false, pass: "http" });
      }
    }
    oldSlugs = { status: "checked", count: probes.length };
  }

  structuredLog({
    msg: "leak_scan_http",
    fetched,
    sample: sample.picked.length,
    offset: sample.offset,
    http_codes: codeCounts(findings, "http") || "0",
  });
  return { findings, oldSlugs, fetched, sampleOffset: sample.offset };
}

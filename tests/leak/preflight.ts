/**
 * Pre-flight and self-tests (spec 4.6). Any failure stops the job.
 *
 *   tsx tests/leak/preflight.ts --baseline   PF-02, on the migrated but unseeded DB
 *   tsx tests/leak/preflight.ts              PF-01, PF-03..PF-07, after seed and sessions
 */
import fs from "node:fs";
import path from "node:path";

import { writeJson } from "./lib/artifacts";
import { loadContext } from "./lib/context";
import { LEAK_DIR, readLeakEnv } from "./lib/env";
import { responseText, send, setAppOrigin } from "./lib/http";
import { plant, type PlantSite } from "./lib/plant";
import type { Ctx, ProbeDef, ProbeOutcome } from "./lib/probe";
import { compileTokens, controlValue, loadManifest, scanText, type Manifest } from "./lib/scan";
import { CATEGORY_LANDINGS, STATIC_PAGES } from "./probes/common";
import { encodingSelfTest, mutationFuzz } from "./selftest/encodings";

const BASELINE_DIR = path.join(LEAK_DIR, "baseline");

type Result = { id: string; pass: boolean; [key: string]: unknown };

function report(result: Result): Result {
  writeJson(`preflight/${result.id}.json`, result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.id}`);
  return result;
}

// ---------------------------------------------------------------------------
// PF-02: baseline collision crawl
// ---------------------------------------------------------------------------

async function baseline(): Promise<Result> {
  const env = readLeakEnv();
  setAppOrigin(env.appUrl);
  const manifest = loadManifest();
  const compiled = compileTokens(manifest);
  const paths = [
    "/",
    ...STATIC_PAGES,
    ...CATEGORY_LANDINGS.map((l) => l.path),
    "/deals",
    "/deals?page=2",
    "/sitemap.xml",
    "/robots.txt",
    "/deals/sitemap/0.xml",
    "/deals/sitemap.xml",
    "/api/search",
    "/api/search?limit=50",
    "/api/search?q=grounds",
    "/api/health",
  ];
  fs.rmSync(BASELINE_DIR, { recursive: true, force: true });
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  const crawled: Array<{ path: string; status: number; bytes: number; tokens: string[] }> = [];
  for (const [i, p] of paths.entries()) {
    const result = await send({ method: "GET", url: `${env.appUrl}${p}`, headers: { "user-agent": "Mozilla/5.0 leak-baseline" } });
    const text = responseText(result);
    const found = [...scanText(text, compiled, result.final.contentType).tokens.keys()];
    crawled.push({ path: p, status: result.final.status, bytes: Buffer.byteLength(result.final.body), tokens: found });
    fs.writeFileSync(path.join(BASELINE_DIR, `${String(i).padStart(2, "0")}.json`), JSON.stringify({ path: p, contentType: result.final.contentType, body: result.final.body }));
  }
  const hits = crawled.filter((c) => c.tokens.length > 0);
  return report({ id: "PF-02", pass: hits.length === 0 && crawled.every((c) => c.status < 500), crawled, manifest_errors: hits });
}

function baselineCorpus(): Array<{ name: string; body: string; contentType?: string }> {
  if (!fs.existsSync(BASELINE_DIR)) return [];
  return fs
    .readdirSync(BASELINE_DIR)
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(BASELINE_DIR, f), "utf8")) as { path: string; contentType: string; body: string })
    .map((d) => ({ name: d.path, body: d.body, contentType: d.contentType }));
}

// ---------------------------------------------------------------------------
// PF-01: manifest lint
// ---------------------------------------------------------------------------

function manifestLint(manifest: Manifest): Result {
  const errors: string[] = [];
  const ids = manifest.tokens.map((t) => t.id);
  for (const id of ids.filter((id, i) => ids.indexOf(id) !== i)) errors.push(`duplicate token id ${id}`);
  const seedFile = path.join(LEAK_DIR, "seed-outcome.json");
  const seeded = fs.existsSync(seedFile) ? new Set((JSON.parse(fs.readFileSync(seedFile, "utf8")) as Array<{ deal_id: string }>).map((r) => r.deal_id)) : null;
  if (!seeded) errors.push("seed-outcome.json is missing");
  const residuals = process.env.LEAK_INCLUDE_RESIDUALS === "1";
  const compiled = compileTokens(manifest);
  const alphabet = new Set(manifest.controls_alphabet);
  for (const token of manifest.tokens) {
    for (const rowId of token.rows) {
      const row = manifest.rows[rowId];
      if (!row) errors.push(`${token.id}: row ${rowId} is not in the manifest`);
      else if (seeded && !seeded.has(row.deal_id) && (row.group !== "residual" || residuals)) errors.push(`${token.id}: row ${rowId} is not in seed-outcome.json`);
    }
    for (const source of token.regex) {
      try {
        new RegExp(source, "gi");
      } catch (error) {
        errors.push(`${token.id}: regex ${source} does not compile: ${String(error)}`);
      }
    }
    const idControl = token.class === "INTERNAL_ID" || token.class === "HELD_DEAL_ID";
    if (!token.control) errors.push(`${token.id}: control is empty`);
    else if (idControl && (!/^[0-9a-f]{8}$/i.test(token.control) || token.control.toLowerCase() === "5eed0000")) {
      errors.push(`${token.id}: id control must be an 8-hex prefix other than 5eed0000`);
    } else if (!idControl && [...token.control.toLowerCase()].some((ch) => !alphabet.has(ch) && !/[a-z]/.test(ch))) {
      errors.push(`${token.id}: control must be letters`);
    } else if (!idControl && [...token.control.toLowerCase()].every((ch) => alphabet.has(ch)) === false && token.control !== "Xbvqmlor") {
      // Stems may be the spec decoy (T01 "Xbvqmlor") or a string drawn from controls_alphabet.
      errors.push(`${token.id}: control must be the spec decoy or drawn from the controls alphabet`);
    }
    const controlHits = [...scanText(token.control, compiled).tokens.keys()];
    if (controlHits.length) errors.push(`${token.id}: control matches ${controlHits.join(",")}`);
    for (const query of token.search_queries) {
      const { spans, control } = controlValue(query, compiled, manifest.controls_alphabet);
      if (!spans.some((s) => s.tokenIds.includes(token.id))) errors.push(`${token.id}: search query ${query} is not matched by its own token`);
      const residue = [...scanText(control, compiled).tokens.keys()];
      if (residue.length) errors.push(`${token.id}: control of ${query} (${control}) still matches ${residue.join(",")}`);
    }
  }
  for (const d of manifest.date_tokens_iso) if (Number.isNaN(Date.parse(`${d}T00:00:00Z`))) errors.push(`date token ${d} is not an ISO date`);
  return report({ id: "PF-01", pass: errors.length === 0, tokens: manifest.tokens.length, errors });
}

// ---------------------------------------------------------------------------
// PF-03: run-date guard (OQ-14)
// ---------------------------------------------------------------------------

function isoDay(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function runDates(now = new Date()): string[] {
  const out = new Set<string>();
  for (const tz of ["UTC", "Europe/London"]) {
    for (let delta = -2; delta <= 2; delta += 1) out.add(isoDay(new Date(now.getTime() + delta * 86_400_000), tz));
  }
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  out.add(monday.toISOString().slice(0, 10));
  return [...out].sort();
}

function dateGuard(manifest: Manifest): Result {
  const dates = runDates();
  const overlap = dates.filter((d) => manifest.date_tokens_iso.includes(d));
  const yearless = dates.filter((d) => manifest.yearless_date_tokens.includes(d.slice(5)));
  return report({ id: "PF-03", pass: overlap.length === 0 && yearless.length === 0, run_dates: dates, overlap, yearless_overlap: yearless });
}

// ---------------------------------------------------------------------------
// PF-07: planted leaks in real responses must fail parity
// ---------------------------------------------------------------------------

async function plantedLeaks(ctx: Ctx): Promise<Result> {
  const htmlSites: PlantSite[] = ["card", "og:description", "rsc"];
  const targets: Array<{ name: string; def: ProbeDef; sites: PlantSite[] }> = [];
  const query = "Zarqwell Borough Council";
  const heldSlug = ctx.row("D2").slug;
  for (const [name, req] of [
    ["/deals?q=", { path: "/deals", query: [["q", query]] as Array<[string, string]> }],
    ["slug route", { path: `/deals/${heldSlug}` }],
  ] as const) {
    targets.push({ name, def: { id: "PF-07", instance: `${name} html`, role: "anon", req, ...(name === "slug route" ? {} : { status: [200] }) }, sites: htmlSites });
    targets.push({ name, def: { id: "PF-07", instance: `${name} rsc`, role: "anon", req: { ...req, rsc: "rsc" }, requireRsc: true }, sites: ["rsc"] });
  }
  targets.push({ name: "/api/search", def: { id: "PF-07", instance: "/api/search json", role: "anon", req: { path: "/api/search", query: [["q", "Vantrexo"]] }, status: [200] }, sites: ["json-item"] });

  const cases: Array<Record<string, unknown>> = [];
  for (const target of targets) {
    const o: ProbeOutcome = await ctx.run(target.def);
    const forbidden = o.spans.filter((s) => s.tokenIds.some(ctx.forbidden("anon")));
    const baselineOk = forbidden.length > 0 && o.control !== null && o.parity?.pass === true && (!Array.isArray(target.def.status) || target.def.status.includes(o.final.status));
    cases.push({ target: target.def.instance, site: "baseline", url: o.url, control_url: o.control?.url ?? null, pass: baselineOk, parity: o.parity?.rows });
    for (const site of target.sites) {
      const text = forbidden[0]?.text ?? "";
      const planted = plant(site, o.final.body, text, o.final.contentType);
      const verdict = ctx.judge(o, planted);
      const failing = verdict.rows.filter((r) => !r.pass);
      const detected = text !== "" && planted !== o.final.body && !verdict.pass && failing.length > 0;
      cases.push({ target: target.def.instance, site, planted_text: text, pass: detected, detected, failing_rows: failing });
    }
  }
  const planted = cases.filter((c) => c.site !== "baseline");
  const htmlCases = planted.filter((c) => String(c.target).endsWith("html"));
  const sitesCovered = new Set(htmlCases.map((c) => c.site));
  return report({
    id: "PF-07",
    pass: cases.every((c) => c.pass) && htmlSites.every((s) => sitesCovered.has(s)),
    cases,
  });
}

async function main(): Promise<void> {
  if (process.argv.includes("--baseline")) {
    const result = await baseline();
    process.exit(result.pass ? 0 : 1);
  }
  const manifest = loadManifest();
  const results: Result[] = [manifestLint(manifest), dateGuard(manifest)];
  const corpus = baselineCorpus();
  const pf04 = encodingSelfTest(manifest, corpus);
  writeJson("selftest/PF-04.json", pf04);
  results.push(report({ id: "PF-04", pass: pf04.pass, cases: pf04.cases, missed: pf04.missed, false_positives: pf04.false_positives, clean_documents: pf04.clean_documents }));
  const seed = Number(process.env.LEAK_FUZZ_SEED ?? Math.floor(Math.random() * 2 ** 31));
  const pf05 = mutationFuzz(manifest, corpus, { seed, iterations: 50 });
  writeJson("selftest/PF-05.json", pf05);
  results.push(report({ id: "PF-05", pass: pf05.pass, seed, iterations: pf05.iterations, missed: pf05.missed }));

  const { ctx, checks } = await loadContext("PF");
  results.push(report({ id: "PF-06", pass: checks.every((c) => c.pass), checks, code: checks.every((c) => c.pass) ? undefined : "SESSION_INVALID" }));
  results.push(await plantedLeaks(ctx));
  writeJson("preflight/summary.json", { pass: results.every((r) => r.pass), results: results.map((r) => ({ id: r.id, pass: r.pass })) });
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

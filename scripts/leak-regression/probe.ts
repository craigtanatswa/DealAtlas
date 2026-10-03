/**
 * Runs the probes in tests/leak-regression/probes.json against a LOCAL app
 * (`next start`) and Supabase stack seeded by seed.ts, and writes a per-probe
 * JSON report plus raw response dumps.
 *
 *   tsx scripts/leak-regression/probe.ts --phase pre-0019 --out leak-report
 *
 * Exits non-zero if any probe fails.
 */
import fs from "node:fs";
import path from "node:path";

import { createServerClient } from "@supabase/ssr";

import {
  type LocalEnv,
  contexts,
  namedList,
  type ProtectedToken,
  type SeedState,
  type TokenMatch,
  type World,
  PROBES_PATH,
  STATE_PATH,
  extractViews,
  fill,
  fillArgs,
  findTokens,
  isEmptyResult,
  loadWorld,
  maskEcho,
  protectedTokens,
  readJson,
  readLocalEnv,
  usedValues,
} from "./lib";

type Phase = "pre-0019" | "post-0019";
type Actor = "anon" | "free" | "pro";

type Expectation = {
  status?: number | number[];
  mustContain?: string[];
  mustNotContain?: string[];
  mustContainAll?: string;
  emptyResult?: boolean;
  nonEmptyViews?: string[];
};

type Probe = {
  id: string;
  kind: "http" | "rest" | "rpc";
  actor: Actor;
  path?: string;
  fn?: string;
  args?: Record<string, unknown>;
  rsc?: boolean;
  forEach?: string;
  views?: string[];
  tokens?: "forbid" | "allow";
  phases?: Phase[];
  expect?: Expectation;
  expectByPhase?: Partial<Record<Phase, Expectation>>;
};

type ProbeFile = { lists: Record<string, string[]>; probes: Probe[] };

type Context = Record<string, string>;

type ViewMatch = TokenMatch & { view: string };

type ProbeResult = {
  probeId: string;
  instanceId: string;
  phase: Phase;
  actor: Actor;
  kind: Probe["kind"];
  target: string;
  status: number;
  pass: boolean;
  failures: string[];
  matchedTokens: ViewMatch[];
  echoMasked: string[];
  rawFile: string;
};

type Session = { cookieHeader?: string; accessToken?: string };

const RSC_HEADERS = {
  RSC: "1",
  "Next-Router-State-Tree": "%5B%22%22%2C%7B%7D%2Cnull%2Cnull%5D",
};

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const phase = get("--phase");
  if (phase !== "pre-0019" && phase !== "post-0019") {
    throw new Error("usage: probe.ts --phase pre-0019|post-0019 [--out leak-report] [--only probe-id]");
  }
  return { phase: phase as Phase, out: get("--out") ?? "leak-report", only: get("--only") };
}

async function signIn(env: LocalEnv, email: string, password: string): Promise<Session> {
  const jar = new Map<string, string>();
  const client = createServerClient(env.supabaseUrl, env.anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign in failed for ${email}: ${error?.message}`);
  if (jar.size === 0) throw new Error(`no session cookies were set for ${email}`);
  return {
    cookieHeader: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
    accessToken: data.session.access_token,
  };
}

async function fetchWithRetry(url: string, init: RequestInit, followRsc = false): Promise<Response> {
  let current = url;
  for (let attempt = 0, hops = 0; ; ) {
    const response = await fetch(current, init);
    const location = response.headers.get("location");
    // Next.js redirects RSC requests to the same path with a cache-busting ?_rsc= key.
    if (followRsc && location?.includes("_rsc=") && hops < 3) {
      await response.text();
      current = new URL(location, current).toString();
      hops += 1;
      continue;
    }
    attempt += 1;
    if (response.status !== 429 || attempt > 3) return response;
    const wait = Math.min(Number(response.headers.get("retry-after") ?? "5"), 65);
    await response.text();
    await new Promise((resolve) => setTimeout(resolve, Math.max(wait, 1) * 1000));
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

async function runProbe(
  probe: Probe,
  context: Context,
  phase: Phase,
  env: LocalEnv,
  sessions: Record<Actor, Session>,
  world: World,
  tokens: ProtectedToken[],
  rawDir: string,
): Promise<ProbeResult> {
  const session = sessions[probe.actor];
  const expectation = probe.expectByPhase?.[phase] ?? probe.expect ?? {};
  const instanceId = context.key ? `${probe.id}--${safeName(context.key)}` : probe.id;

  let target: string;
  let response: Response;
  if (probe.kind === "http") {
    target = `${env.appUrl}${fill(probe.path!, context, true)}`;
    const headers: Record<string, string> = probe.rsc ? { ...RSC_HEADERS } : {};
    if (session.cookieHeader) headers.Cookie = session.cookieHeader;
    response = await fetchWithRetry(target, { headers, redirect: "manual" }, Boolean(probe.rsc));
  } else {
    const restPath =
      probe.kind === "rpc" ? `/rest/v1/rpc/${probe.fn}` : fill(probe.path!, context, true);
    target = `${env.supabaseUrl}${restPath}`;
    const headers: Record<string, string> = {
      apikey: env.anonKey,
      Authorization: `Bearer ${session.accessToken ?? env.anonKey}`,
      Accept: "application/json",
    };
    const init: RequestInit = { headers, redirect: "manual" };
    if (probe.kind === "rpc") {
      headers["Content-Type"] = "application/json";
      init.method = "POST";
      init.body = JSON.stringify(fillArgs(probe.args ?? {}, context));
      target = `${target} ${init.body}`;
    }
    response = await fetchWithRetry(`${env.supabaseUrl}${restPath}`, init);
  }

  const body = await response.text();
  const headerText = [...response.headers].map(([name, value]) => `${name}: ${value}`).join("\n");
  const views = { headers: headerText, ...extractViews(body, probe.views ?? ["body"]) };

  const failures: string[] = [];
  const allowed = Array.isArray(expectation.status)
    ? expectation.status
    : expectation.status !== undefined
      ? [expectation.status]
      : null;
  if (allowed && !allowed.includes(response.status)) {
    failures.push(`status ${response.status}, expected ${allowed.join(" or ")}`);
  }

  const echoInputs =
    probe.kind === "http" ? usedValues(probe.path, context) : probe.kind === "rest" ? usedValues(probe.path, context) : [];
  const echoMasked: string[] = [];
  const matchedTokens: ViewMatch[] = [];
  for (const [view, text] of Object.entries(views)) {
    const scanned = view === "items" ? text : maskEcho(text, echoInputs);
    if (scanned !== text) echoMasked.push(view);
    for (const match of findTokens(scanned, tokens)) matchedTokens.push({ ...match, view });
  }
  if ((probe.tokens ?? "forbid") === "forbid" && matchedTokens.length > 0) {
    const unique = [...new Set(matchedTokens.map((match) => `${match.token} [${match.category}]`))];
    failures.push(`protected tokens present: ${unique.join(", ")}`);
  }

  for (const needle of expectation.mustContain ?? []) {
    const value = fill(needle, context, false);
    if (!body.includes(value)) failures.push(`missing expected text "${value}"`);
  }
  if (expectation.mustContainAll) {
    for (const value of namedList(world, expectation.mustContainAll)) {
      if (!body.includes(value)) failures.push(`missing expected text "${value}"`);
    }
  }
  for (const needle of expectation.mustNotContain ?? []) {
    const value = fill(needle, context, false);
    if (body.includes(value)) failures.push(`contains forbidden text "${value}"`);
  }
  if (expectation.emptyResult && !isEmptyResult(body)) failures.push("expected an empty result");
  for (const view of expectation.nonEmptyViews ?? []) {
    if (!views[view as keyof typeof views]?.trim()) failures.push(`view "${view}" is empty`);
  }

  const rawFile = path.join(rawDir, `${instanceId}.txt`);
  fs.writeFileSync(
    rawFile,
    `${probe.actor} ${target}\nphase: ${phase}\nstatus: ${response.status}\n${headerText}\n\n${body}`,
  );

  return {
    probeId: probe.id,
    instanceId,
    phase,
    actor: probe.actor,
    kind: probe.kind,
    target,
    status: response.status,
    pass: failures.length === 0,
    failures,
    matchedTokens,
    echoMasked: echoMasked.length > 0 ? echoInputs : [],
    rawFile: path.relative(path.dirname(rawDir), rawFile),
  };
}

async function main() {
  const { phase, out, only } = parseArgs();
  const env = readLocalEnv();
  const world = loadWorld();
  const state = readJson<SeedState>(STATE_PATH);
  const { lists, probes } = readJson<ProbeFile>(PROBES_PATH);
  const tokens = protectedTokens(world);

  const sessions: Record<Actor, Session> = {
    anon: {},
    free: await signIn(env, state.users.free.email, state.users.free.password),
    pro: await signIn(env, state.users.pro.email, state.users.pro.password),
  };

  const rawDir = path.join(out, "raw", phase);
  fs.mkdirSync(rawDir, { recursive: true });

  const results: ProbeResult[] = [];
  for (const probe of probes) {
    if (only && probe.id !== only) continue;
    if (probe.phases && !probe.phases.includes(phase)) continue;
    for (const context of contexts(world, state, lists, probe.forEach)) {
      const result = await runProbe(probe, context, phase, env, sessions, world, tokens, rawDir);
      results.push(result);
      if (!result.pass) console.error(`FAIL ${result.instanceId}: ${result.failures.join("; ")}`);
    }
  }

  const failed = results.filter((result) => !result.pass);
  const report = {
    phase,
    generatedAt: new Date().toISOString(),
    protectedTokenCount: tokens.length,
    probeCount: results.length,
    failedCount: failed.length,
    results,
  };
  fs.writeFileSync(path.join(out, `report-${phase}.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(out, "protected-tokens.json"), JSON.stringify(tokens, null, 2));

  const summary = `### Leak regression (${phase})\n\n${results.length} probe responses checked against ${tokens.length} protected tokens: ${results.length - failed.length} passed, ${failed.length} failed.\n${failed
    .map((result) => `- \`${result.instanceId}\`: ${result.failures.join("; ")}`)
    .join("\n")}\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  if (failed.length > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});

/**
 * Probe execution: one request (plus its control request when the request
 * carries tokens), scanned on every layer, judged by NT with reflection
 * parity (spec sections 4.4 and 5), and written out per section 8.
 */
import { spawnSync } from "node:child_process";

import pLimit from "p-limit";

import { redactHeaders, safeName, sha256, writeHops, writeJson, writeLayers, writeRaw } from "./artifacts";
import type { LeakEnv, LeakUsers } from "./env";
import { headerText, parseJson, responseText, send, type HttpHop, type HttpResult } from "./http";
import {
  compileTokens,
  controlValue,
  forbiddenFor,
  reflectionParity,
  scanText,
  urlDecode,
  type CompiledToken,
  type Layer,
  type Manifest,
  type ManifestToken,
  type ParityVerdict,
  type ReflectedSpan,
  type Role,
  type ScanResult,
} from "./scan";
import type { Session } from "./session";

export type Phase = "A" | "B" | "PF";
export type Severity = "P0" | "P1" | "P2";

export const UAS = {
  chromium:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  twitterbot: "Twitterbot/1.0",
  facebookexternalhit: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  slackbot: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  linkedinbot: "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
  whatsapp: "WhatsApp/2.24.6.77 A",
  bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
} as const;
export type UaName = keyof typeof UAS;
export const UA_MATRIX = Object.keys(UAS) as UaName[];

export type Target = "app" | "rest" | "graphql" | "auth" | "mail";

export type RequestSpec = {
  method?: string;
  target?: Target;
  /** Decoded path. Each `/`-separated segment is percent-encoded unless rawPath is set. */
  path: string;
  rawPath?: boolean;
  query?: Array<[string, string]>;
  json?: unknown;
  headers?: Record<string, string>;
  ua?: UaName;
  rsc?: "rsc" | "prefetch";
  /** REST credentials: the role's JWT when signed in (default), or the anon key only. */
  restAuth?: "role" | "anon";
  followRedirects?: boolean;
};

export type Assertion = {
  id: string;
  pass: boolean;
  expected?: unknown;
  actual?: unknown;
  code?: string;
  /** Non-blocking assertions are reported but never fail the probe. */
  blocking?: boolean;
};

export type ProbeDef = {
  id: string;
  instance: string;
  role: Role;
  severity?: Severity;
  req: RequestSpec;
  status?: number[] | ((status: number) => boolean);
  /** NT check; default true for every role except pro. */
  nt?: boolean;
  /** Tokens recorded as expected exposures instead of failures (OQ-9). */
  expectedExposure?: { tokens: string[]; reason: string };
  /** Whether a control request is sent when the request carries tokens (default true). */
  control?: boolean;
  /** HDR-02: these response headers are scanned on their own with parity. */
  hdr02?: boolean;
  requireRsc?: boolean;
  check?: (outcome: ProbeOutcome) => Assertion[] | Promise<Assertion[]>;
  /** Family label used by the summary (defaults to the id prefix). */
  family?: string;
};

export type ProbeOutcome = {
  def: ProbeDef;
  url: string;
  result: HttpResult;
  final: HttpHop;
  json: unknown;
  scan: ScanResult;
  control: { url: string; result: HttpResult; scan: ScanResult; json: unknown } | null;
  spans: ReflectedSpan[];
  parity: ParityVerdict | null;
};

export type MatchRecord = {
  token_id: string;
  class: string;
  layer: Layer;
  offset: number;
  snippet: string;
  reflected: boolean;
};

export type ProbeRecord = {
  probe_id: string;
  family: string;
  instance: string;
  phase: Phase;
  role: Role;
  severity: Severity;
  method: string;
  url: string;
  request_headers_redacted: Record<string, string>;
  status: number;
  content_type: string;
  bytes: number;
  sha256: string;
  raw_path: string | null;
  hops: Array<{ url: string; status: number }>;
  layers_scanned: Layer[];
  layers_written: string[];
  matches: MatchRecord[];
  tokens_present: string[];
  reflection: {
    control_url: string | null;
    parity: Array<{ token_id: string; layer: Layer; probe_count: number; control_count: number; pass: boolean }>;
    unreflected: Array<{ token_id: string; counts: Partial<Record<Layer, number>> }>;
  } | null;
  expected_exposures: Array<{ token_id: string; reason: string; counts: Partial<Record<Layer, number>> }>;
  assertions: Assertion[];
  pass: boolean;
  retries: number;
  duration_ms: number;
  started_at_utc: string;
  derived_from?: string;
};

const ALL_LAYERS: Layer[] = ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7"];

export class Ctx {
  readonly compiled: CompiledToken[];
  readonly tokens: Map<string, ManifestToken>;
  readonly records: ProbeRecord[] = [];
  readonly outcomes = new Map<string, ProbeOutcome>();
  /** Normalised results of deterministic probes, compared across phases (B-LOCK-05, B-XPH-01). */
  readonly snapshots = new Map<string, unknown>();
  /** Wider than the app can serve at once so slots waiting on one rate-limit bucket don't stall the other. */
  private readonly limit = pLimit(12);

  constructor(
    readonly phase: Phase,
    readonly env: LeakEnv,
    readonly manifest: Manifest,
    readonly users: LeakUsers,
    readonly sessions: Map<Role, Session>,
  ) {
    this.compiled = compileTokens(manifest);
    this.tokens = new Map(manifest.tokens.map((t) => [t.id, t]));
  }

  pid(id: string): string {
    return this.phase === "PF" ? id : `${this.phase}-${id}`;
  }

  /** Artifact directory: preflight/ for PF-07, phase-A/ or phase-B/ otherwise. */
  get dir(): string {
    return this.phase === "PF" ? "preflight" : `phase-${this.phase}`;
  }

  session(role: Role): Session {
    const session = this.sessions.get(role);
    if (!session) throw new Error(`SESSION_INVALID: no session for ${role}`);
    return session;
  }

  row(id: string): { deal_id: string; slug: string; group: string } {
    const row = this.manifest.rows[id];
    if (!row) throw new Error(`unknown manifest row ${id}`);
    return row;
  }

  // -------------------------------------------------------------------------
  // Requests
  // -------------------------------------------------------------------------

  private base(target: Target): string {
    switch (target) {
      case "app":
        return this.env.appUrl;
      case "rest":
        return `${this.env.supabaseUrl}/rest/v1`;
      case "graphql":
        return `${this.env.supabaseUrl}/graphql/v1`;
      case "auth":
        return `${this.env.supabaseUrl}/auth/v1`;
      case "mail":
        return this.env.mailUrl;
    }
  }

  buildUrl(req: RequestSpec): string {
    const path = req.rawPath ? req.path : req.path.split("/").map((seg) => encodeURIComponent(seg)).join("/");
    const qs = req.query?.length ? `?${new URLSearchParams(req.query).toString()}` : "";
    return `${this.base(req.target ?? "app")}${path}${qs}`;
  }

  buildHeaders(req: RequestSpec, role: Role): Record<string, string> {
    const session = role === "anon" ? null : this.session(role);
    const headers: Record<string, string> = {};
    const target = req.target ?? "app";
    if (target === "app") {
      headers["user-agent"] = UAS[req.ua ?? "chromium"];
      if (session?.cookieHeader) headers.cookie = session.cookieHeader;
      if (req.rsc) {
        headers.rsc = "1";
        headers["next-router-state-tree"] = encodeURIComponent('["",{},null,null]');
        if (req.rsc === "prefetch") headers["next-router-prefetch"] = "1";
      }
    } else if (target === "rest" || target === "graphql" || target === "auth") {
      headers.apikey = this.env.anonKey;
      const jwt = req.restAuth === "anon" || !session?.accessToken ? this.env.anonKey : session.accessToken;
      headers.authorization = `Bearer ${jwt}`;
    }
    if (req.json !== undefined) headers["content-type"] = "application/json";
    return { ...headers, ...(req.headers ?? {}) };
  }

  /** The request with every token span replaced by its control (spec 4.4 step 3). */
  controlRequest(req: RequestSpec): { req: RequestSpec; spans: ReflectedSpan[] } {
    const spans: ReflectedSpan[] = [];
    const alphabet = this.manifest.controls_alphabet;
    const swap = (value: string): string => {
      const decoded = urlDecode(value);
      const { control, spans: found } = controlValue(decoded, this.compiled, alphabet);
      spans.push(...found);
      return found.length ? control : value;
    };
    const swapJson = (value: unknown): unknown => {
      if (typeof value === "string") return swap(value);
      if (Array.isArray(value)) return value.map(swapJson);
      if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swapJson(v)]));
      }
      return value;
    };
    const path = req.path
      .split("/")
      .map((seg) => (seg ? swap(seg) : seg))
      .join("/");
    const query = req.query?.map(([k, v]) => [k, swap(v)] as [string, string]);
    const json = req.json === undefined ? undefined : swapJson(req.json);
    return { req: { ...req, path, query, json }, spans };
  }

  async fetch(req: RequestSpec, role: Role): Promise<{ url: string; result: HttpResult; headers: Record<string, string> }> {
    const url = this.buildUrl(req);
    const headers = this.buildHeaders(req, role);
    const result = await send({
      method: req.method ?? "GET",
      url,
      headers,
      body: req.json === undefined ? undefined : JSON.stringify(req.json),
      followRedirects: req.followRedirects,
    });
    return { url, result, headers };
  }

  forbidden(role: Role, allowed: string[] = []): (tokenId: string) => boolean {
    return (tokenId) => {
      const token = this.tokens.get(tokenId);
      return Boolean(token) && forbiddenFor(token!, role) && !allowed.includes(tokenId);
    };
  }

  // -------------------------------------------------------------------------
  // Probes
  // -------------------------------------------------------------------------

  run(def: ProbeDef): Promise<ProbeOutcome> {
    return this.limit(() => this.execute(def));
  }

  private async execute(def: ProbeDef): Promise<ProbeOutcome> {
    const nt = def.nt ?? def.role !== "pro";
    const { req: controlReq, spans } = this.controlRequest(def.req);
    const wantsControl = nt && def.control !== false && spans.some((s) => s.tokenIds.some(this.forbidden(def.role)));
    const [probe, control] = await Promise.all([
      this.fetch(def.req, def.role),
      wantsControl ? this.fetch(controlReq, def.role) : Promise.resolve(null),
    ]);
    const final = probe.result.final;
    const scan = scanText(responseText(probe.result), this.compiled, final.contentType);
    const controlScan = control ? scanText(responseText(control.result), this.compiled, control.result.final.contentType) : null;
    const outcome: ProbeOutcome = {
      def,
      url: probe.url,
      result: probe.result,
      final,
      json: parseJson(final),
      scan,
      control: control ? { url: control.url, result: control.result, scan: controlScan!, json: parseJson(control.result.final) } : null,
      spans,
      parity: null,
    };

    const assertions: Assertion[] = [];
    const exposures: ProbeRecord["expected_exposures"] = [];
    if (probe.result.rateLimited || control?.result.rateLimited) {
      assertions.push({ id: "rate_limited", pass: false, code: "RATE_LIMITED", actual: 429 });
    }
    if (def.status) {
      const ok = Array.isArray(def.status) ? def.status.includes(final.status) : def.status(final.status);
      assertions.push({ id: "status", expected: Array.isArray(def.status) ? def.status : "predicate", actual: final.status, pass: ok });
    }
    if (def.requireRsc) {
      const isRsc = final.contentType.includes("text/x-component");
      assertions.push({ id: "rsc_obtained", pass: isRsc, actual: final.contentType, code: isRsc ? undefined : "RSC_NOT_OBTAINED" });
    }
    if (nt) {
      const allowed = def.expectedExposure?.tokens ?? [];
      outcome.parity = reflectionParity({
        probe: scan,
        control: controlScan,
        spans,
        tokens: this.tokens,
        forbidden: this.forbidden(def.role, allowed),
      });
      assertions.push({
        id: "no_forbidden_tokens",
        pass: outcome.parity.pass,
        actual: outcome.parity.pass
          ? undefined
          : {
              unreflected: outcome.parity.unreflected.map((u) => u.tokenId),
              parity_failures: outcome.parity.rows.filter((r) => !r.pass).map((r) => `${r.tokenId}@${r.layer}`),
            },
      });
      for (const tokenId of allowed) {
        const hit = scan.tokens.get(tokenId);
        if (hit && forbiddenFor(this.tokens.get(tokenId)!, def.role)) {
          exposures.push({ token_id: tokenId, reason: def.expectedExposure!.reason, counts: hit.counts });
        }
      }
      // HDR-01: headers of every hop, on their own, with parity against the control's headers.
      const headerScan = scanText(probe.result.hops.map(headerText).join("\n"), this.compiled);
      const controlHeaderScan = control ? scanText(control.result.hops.map(headerText).join("\n"), this.compiled) : null;
      const headerParity = reflectionParity({
        probe: headerScan,
        control: controlHeaderScan,
        spans,
        tokens: this.tokens,
        forbidden: this.forbidden(def.role, allowed),
      });
      assertions.push({ id: "headers_nt", pass: headerParity.pass, actual: headerParity.pass ? undefined : headerParity });
      if (def.hdr02) {
        const pick = (hops: HttpHop[]) =>
          hops
            .flatMap((hop) =>
              hop.headers.filter(([n]) => n === "location" || n === "link" || n.startsWith("x-nextjs") || n === "x-matched-path"),
            )
            .map(([n, v]) => `${n}: ${v}`)
            .join("\n");
        const hdr = reflectionParity({
          probe: scanText(pick(probe.result.hops), this.compiled),
          control: control ? scanText(pick(control.result.hops), this.compiled) : null,
          spans,
          tokens: this.tokens,
          forbidden: this.forbidden(def.role, allowed),
        });
        assertions.push({ id: "hdr02_nt", pass: hdr.pass, actual: hdr.pass ? undefined : hdr });
      }
    }
    if (def.check) {
      try {
        assertions.push(...(await def.check(outcome)));
      } catch (error) {
        assertions.push({ id: "check_error", pass: false, actual: String(error) });
      }
    }
    this.record(def, outcome, assertions, exposures, probe.headers);
    this.outcomes.set(`${def.id}|${def.role}|${def.instance}`, outcome);
    return outcome;
  }

  private record(
    def: ProbeDef,
    outcome: ProbeOutcome,
    assertions: Assertion[],
    exposures: ProbeRecord["expected_exposures"],
    requestHeaders: Record<string, string>,
  ): ProbeRecord {
    const probeId = this.pid(def.id);
    const base = `${this.dir}/raw/${safeName(`${probeId}__${def.role}__${def.instance}`)}`;
    const matches: MatchRecord[] = [];
    const reflectedIds = new Set(outcome.spans.flatMap((s) => s.tokenIds));
    for (const [tokenId, hit] of outcome.scan.tokens) {
      for (const snip of hit.snippets) {
        matches.push({
          token_id: tokenId,
          class: hit.tokenClass,
          layer: snip.layer,
          offset: snip.offset,
          snippet: snip.snippet.slice(0, 160),
          reflected: reflectedIds.has(tokenId),
        });
      }
    }
    const pass = assertions.every((a) => a.pass || a.blocking === false);
    const raw = writeHops(base, outcome.result.hops);
    if (outcome.control) writeHops(`${base}.control`, outcome.control.result.hops);
    const layersWritten = matches.length > 0 || !pass ? writeLayers(base, outcome.scan.layers) : [];
    const record: ProbeRecord = {
      probe_id: probeId,
      family: def.family ?? def.id.replace(/-\d+$/, ""),
      instance: def.instance,
      phase: this.phase,
      role: def.role,
      severity: def.severity ?? "P0",
      method: def.req.method ?? "GET",
      url: outcome.url,
      request_headers_redacted: redactHeaders(requestHeaders),
      status: outcome.final.status,
      content_type: outcome.final.contentType,
      bytes: Buffer.byteLength(outcome.final.body),
      sha256: sha256(outcome.final.body),
      raw_path: raw.body,
      hops: outcome.result.hops.map((h) => ({ url: h.url, status: h.status })),
      layers_scanned: ALL_LAYERS,
      layers_written: layersWritten,
      matches,
      tokens_present: [...outcome.scan.tokens.keys()],
      reflection: outcome.parity
        ? {
            control_url: outcome.control?.url ?? null,
            parity: outcome.parity.rows.map((r) => ({
              token_id: r.tokenId,
              layer: r.layer,
              probe_count: r.probeCount,
              control_count: r.controlCount,
              pass: r.pass,
            })),
            unreflected: outcome.parity.unreflected.map((u) => ({ token_id: u.tokenId, counts: u.counts })),
          }
        : null,
      expected_exposures: exposures,
      assertions,
      pass,
      retries: outcome.result.retries,
      duration_ms: outcome.result.durationMs,
      started_at_utc: outcome.result.startedAt,
    };
    this.push(record);
    return record;
  }

  push(record: ProbeRecord): void {
    this.records.push(record);
    writeJson(`${this.dir}/probes/${safeName(`${record.probe_id}__${record.role}__${record.instance}`)}.json`, record);
  }

  /** A probe whose evidence is computed from other probes or from psql. */
  derive(input: {
    id: string;
    instance: string;
    role: Role | "db";
    assertions: Assertion[];
    severity?: Severity;
    derivedFrom?: string;
    family?: string;
    detail?: unknown;
  }): ProbeRecord {
    const pass = input.assertions.every((a) => a.pass || a.blocking === false);
    const record: ProbeRecord & { detail?: unknown } = {
      probe_id: this.pid(input.id),
      family: input.family ?? input.id.replace(/-\d+$/, ""),
      instance: input.instance,
      phase: this.phase,
      role: input.role as Role,
      severity: input.severity ?? "P0",
      method: input.role === "db" ? "PSQL" : "DERIVED",
      url: "",
      request_headers_redacted: {},
      status: 0,
      content_type: "",
      bytes: 0,
      sha256: "",
      raw_path: null,
      hops: [],
      layers_scanned: [],
      layers_written: [],
      matches: [],
      tokens_present: [],
      reflection: null,
      expected_exposures: [],
      assertions: input.assertions,
      pass,
      retries: 0,
      duration_ms: 0,
      started_at_utc: new Date().toISOString(),
      derived_from: input.derivedFrom,
      detail: input.detail,
    };
    this.push(record);
    return record;
  }

  outcome(id: string, role: Role, instance: string): ProbeOutcome | undefined {
    return this.outcomes.get(`${id}|${role}|${instance}`);
  }

  /** Section 4.4 verdict for a response body against an existing probe's spans and control. */
  judge(outcome: ProbeOutcome, body: string): ParityVerdict {
    const hop = { ...outcome.final, body };
    const hops = [...outcome.result.hops.slice(0, -1), hop];
    const scan = scanText(responseText({ ...outcome.result, hops, final: hop }), this.compiled, hop.contentType);
    return reflectionParity({
      probe: scan,
      control: outcome.control?.scan ?? null,
      spans: outcome.spans,
      tokens: this.tokens,
      forbidden: this.forbidden(outcome.def.role, outcome.def.expectedExposure?.tokens ?? []),
    });
  }

  /**
   * NT over text that no request carried (emails, browser state, aborted
   * beacons): every forbidden token is unreflected, so any match fails.
   */
  capture(input: {
    id: string;
    instance: string;
    role: Role;
    text: string;
    severity?: Severity;
    nt?: boolean;
    check?: (scan: ScanResult) => Assertion[];
    detail?: unknown;
    /** When the captured page's own URL carries tokens: its spans and the same capture of the control URL. */
    reflect?: { spans: ReflectedSpan[]; controlText: string | null };
  }): ProbeRecord {
    const scan = scanText(input.text, this.compiled);
    const nt = input.nt ?? input.role !== "pro";
    const assertions: Assertion[] = [];
    let verdict: ParityVerdict | null = null;
    if (nt) {
      verdict = reflectionParity({
        probe: scan,
        control: input.reflect?.controlText != null ? scanText(input.reflect.controlText, this.compiled) : null,
        spans: input.reflect?.spans ?? [],
        tokens: this.tokens,
        forbidden: this.forbidden(input.role),
      });
      assertions.push({
        id: "no_forbidden_tokens",
        pass: verdict.pass,
        actual: verdict.pass
          ? undefined
          : { unreflected: verdict.unreflected.map((u) => u.tokenId), parity_failures: verdict.rows.filter((r) => !r.pass).map((r) => `${r.tokenId}@${r.layer}`) },
      });
    }
    if (input.check) assertions.push(...input.check(scan));
    const probeId = this.pid(input.id);
    const base = `${this.dir}/raw/${safeName(`${probeId}__${input.role}__${input.instance}`)}`;
    const raw = writeRaw(`${base}.body`, input.text);
    const matches: MatchRecord[] = [];
    const reflectedIds = new Set((input.reflect?.spans ?? []).flatMap((s) => s.tokenIds));
    for (const [tokenId, hit] of scan.tokens) {
      for (const snip of hit.snippets) {
        matches.push({ token_id: tokenId, class: hit.tokenClass, layer: snip.layer, offset: snip.offset, snippet: snip.snippet.slice(0, 160), reflected: reflectedIds.has(tokenId) });
      }
    }
    const pass = assertions.every((a) => a.pass || a.blocking === false);
    const record: ProbeRecord & { detail?: unknown } = {
      probe_id: probeId,
      family: input.id.replace(/-\d+$/, ""),
      instance: input.instance,
      phase: this.phase,
      role: input.role,
      severity: input.severity ?? "P0",
      method: "CAPTURE",
      url: "",
      request_headers_redacted: {},
      status: 0,
      content_type: "text/plain",
      bytes: Buffer.byteLength(input.text),
      sha256: sha256(input.text),
      raw_path: raw,
      hops: [],
      layers_scanned: ALL_LAYERS,
      layers_written: matches.length > 0 || !pass ? writeLayers(base, scan.layers) : [],
      matches,
      tokens_present: [...scan.tokens.keys()],
      reflection:
        verdict && input.reflect
          ? {
              control_url: null,
              parity: verdict.rows.map((r) => ({ token_id: r.tokenId, layer: r.layer, probe_count: r.probeCount, control_count: r.controlCount, pass: r.pass })),
              unreflected: verdict.unreflected.map((u) => ({ token_id: u.tokenId, counts: u.counts })),
            }
          : null,
      expected_exposures: [],
      assertions,
      pass,
      retries: 0,
      duration_ms: 0,
      started_at_utc: new Date().toISOString(),
      detail: input.detail,
    };
    this.push(record);
    return record;
  }

  // -------------------------------------------------------------------------
  // psql (as postgres; local stack only, guarded by readLeakEnv)
  // -------------------------------------------------------------------------

  psql(sql: string): string {
    return psql(this.env.dbUrl, sql);
  }

  psqlJson<T>(sql: string): T {
    return JSON.parse(this.psql(`select coalesce(json_agg(row_to_json(t)), '[]'::json) from (${sql}) t`) || "[]") as T;
  }
}

export function psql(dbUrl: string, sql: string): string {
  const result = spawnSync("psql", [dbUrl, "-XAtq", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

const SLUG_HREF = /\/deals\/([a-z0-9][a-z0-9-]{2,}[a-z0-9])(?=["'?#/\\\s<]|$)/g;

/** Preview slugs linked from a page (cards, JSON-LD, flight data), excluding sitemap paths. */
export function slugsIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(SLUG_HREF)) {
    if (m[1] === "sitemap" || m[1].startsWith("sitemap")) continue;
    out.add(m[1]);
  }
  return out;
}

export function setEq(a: Iterable<string>, b: Iterable<string>): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

export function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

export function eq(id: string, expected: unknown, actual: unknown, extra: Partial<Assertion> = {}): Assertion {
  return { id, expected, actual, pass: JSON.stringify(expected) === JSON.stringify(actual), ...extra };
}

export function ok(id: string, pass: boolean, actual?: unknown, extra: Partial<Assertion> = {}): Assertion {
  return { id, pass, actual: pass ? undefined : actual, ...extra };
}

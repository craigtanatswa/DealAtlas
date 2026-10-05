/**
 * Leak scanner (spec pr1-local-probes.md section 4). Every response is decoded
 * into layers L0..L7 and every forbidden token is counted per layer. Nothing
 * is ever masked: a token that the request itself carries is judged by
 * reflection parity against a control request (section 4.4), never by
 * blanking it out of the response.
 */
import fs from "node:fs";
import path from "node:path";

export const LAYERS = ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7"] as const;
export type Layer = (typeof LAYERS)[number];

export type Role = "anon" | "free" | "free_lapsed" | "free_expired" | "pro";
export const FREE_ROLES: Role[] = ["free", "free_lapsed", "free_expired"];
export const NON_PRO_ROLES: Role[] = ["anon", ...FREE_ROLES];

export type ManifestToken = {
  id: string;
  class: string;
  canonical: string;
  variants: string[];
  regex: string[];
  match: { boundary: "none" | "word" | "digit"; squash: boolean };
  rows: string[];
  search_queries: string[];
  control: string;
  forbidden_for?: Role[];
};

export type Manifest = {
  version: number;
  controls_alphabet: string;
  date_tokens_iso: string[];
  yearless_date_tokens: string[];
  rows: Record<string, { deal_id: string; slug: string; group: string }>;
  orgs: Record<string, string>;
  tokens: ManifestToken[];
};

export const MANIFEST_PATH = path.join(__dirname, "..", "tokens.json");

export function loadManifest(file = MANIFEST_PATH): Manifest {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
}

export function forbiddenFor(token: ManifestToken, role: Role): boolean {
  if (role === "pro") return false;
  return (token.forbidden_for ?? NON_PRO_ROLES).includes(role);
}

// ---------------------------------------------------------------------------
// Decode layers
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", rsquo: "\u2019",
  lsquo: "\u2018", ldquo: "\u201c", rdquo: "\u201d", ndash: "\u2013", mdash: "\u2014",
  pound: "\u00a3", hellip: "\u2026", copy: "\u00a9", middot: "\u00b7", bull: "\u2022",
  shy: "\u00ad", zwj: "\u200d", zwnj: "\u200c", sol: "/", period: ".", colon: ":",
  commat: "@", num: "#", percnt: "%", plus: "+", equals: "=", hyphen: "-", dash: "-",
  lpar: "(", rpar: ")", comma: ",", excl: "!", quest: "?", lowbar: "_", bsol: "\\",
  thinsp: "\u2009", ensp: "\u2002", emsp: "\u2003", euro: "\u20ac", times: "\u00d7",
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);?/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

function jsonUnescapeOnce(text: string): string {
  return text.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|["\\/bfnrt'])/g, (_whole, esc: string) => {
    switch (esc[0]) {
      case "u":
        return String.fromCharCode(parseInt(esc.slice(1), 16));
      case "x":
        return String.fromCharCode(parseInt(esc.slice(1), 16));
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      default:
        return esc;
    }
  });
}

export function jsonUnescape(text: string, passes = 3): string {
  let current = text;
  for (let i = 0; i < passes; i += 1) {
    const next = jsonUnescapeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

/** Concatenated Next flight data: self.__next_f.push string chunks, or a text/x-component body. */
export function flightText(raw: string, contentType = ""): string {
  const chunks: string[] = [];
  const pushRe = /self\.__next_f\.push\(\[\s*\d+\s*,\s*("(?:[^"\\]|\\.)*")\s*\]\)/g;
  for (const m of raw.matchAll(pushRe)) {
    try {
      chunks.push(JSON.parse(m[1]) as string);
    } catch {
      chunks.push(jsonUnescape(m[1].slice(1, -1)));
    }
  }
  if (contentType.includes("text/x-component") || /^[0-9a-f]+:[\[{"IHTDE]/m.test(raw.slice(0, 200))) {
    chunks.push(raw);
  }
  return jsonUnescape(decodeHtmlEntities(chunks.join("\n")));
}

export function urlDecode(text: string, passes = 2): string {
  let current = text;
  for (let i = 0; i < passes; i += 1) {
    const next = current
      .replace(/\+/g, " ")
      .replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => {
        try {
          return decodeURIComponent(run);
        } catch {
          return run.replace(/%([0-9a-fA-F]{2})/g, (_w, hex: string) => String.fromCharCode(parseInt(hex, 16)));
        }
      });
    if (next === current) break;
    current = next;
  }
  return current;
}

const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff\u00ad\u180e]/g;

export function normalise(text: string): string {
  return text
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .replace(/[\u00a0\u202f\u2007\u2009\u2002\u2003]/g, " ")
    .replace(/[\u2018\u2019\u201a\u201b\u2032\u00b4`]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[ \t]+/g, " ")
    .toLowerCase();
}

export function squash(text: string): string {
  return text.replace(/[^a-z0-9]+/g, "");
}

const BASE64_RUN = /(?:base64-)?([A-Za-z0-9+/_-]{24,}={0,2})/g;

function printableRatio(text: string): number {
  if (!text) return 0;
  let printable = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if ((code >= 32 && code < 127) || code === 9 || code === 10 || code === 13 || code >= 160) printable += 1;
  }
  return printable / text.length;
}

export function base64Decodings(text: string): string {
  const out: string[] = [];
  for (const m of text.matchAll(BASE64_RUN)) {
    const run = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = run + "=".repeat((4 - (run.length % 4)) % 4);
    let decoded: string;
    try {
      decoded = Buffer.from(padded, "base64").toString("utf8");
    } catch {
      continue;
    }
    if (decoded.length >= 8 && printableRatio(decoded) >= 0.85) out.push(decoded);
  }
  return out.join("\n");
}

export type Layers = Record<Layer, string>;

export function decodeLayers(raw: string, contentType = ""): Layers {
  const L1 = decodeHtmlEntities(raw);
  const L2 = jsonUnescape(L1);
  const L3 = flightText(raw, contentType);
  const L4 = urlDecode(L2);
  const L5 = normalise(`${L4}\n${urlDecode(L3)}`);
  const L6 = squash(L5);
  const L7src = base64Decodings(`${raw}\n${L4}`);
  const L7 = L7src ? normalise(urlDecode(jsonUnescape(decodeHtmlEntities(L7src)))) : "";
  return { L0: raw, L1, L2, L3, L4, L5, L6, L7 };
}

// ---------------------------------------------------------------------------
// Token patterns
// ---------------------------------------------------------------------------

export type CompiledToken = {
  token: ManifestToken;
  patterns: RegExp[];
  squashed: string[];
};

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SEP = "[\\s\\u00a0\\u202f\\-_.]*";

/** Literal variant -> a pattern tolerating case, separators, possessives and &/and. */
export function variantPattern(variant: string): string {
  const words = normalise(variant)
    .replace(/'s\b/g, "")
    .split(/[^a-z0-9&@]+/)
    .filter(Boolean);
  return words
    .map((word) => (word === "&" || word === "and" ? "(?:&|and)" : escapeRe(word)))
    .join(SEP);
}

function wrap(pattern: string, boundary: ManifestToken["match"]["boundary"]): string {
  if (boundary === "word") return `(?<![a-z0-9])(?:${pattern})(?![a-z0-9])`;
  if (boundary === "digit") return `(?<!\\d)(?:${pattern})(?!\\d)`;
  return `(?:${pattern})`;
}

/**
 * Spec §3: a variant under 8 characters always carries a boundary. Numeric
 * fragments (`17/11` → `1711`) use a digit boundary; other short variants
 * (`ZE9`) use a word boundary. Longer variants keep the token's own boundary.
 */
export function shortVariantBoundary(variant: string): "word" | "digit" | null {
  const compact = normalise(variant).replace(/[^a-z0-9]/g, "");
  if (compact.length === 0 || compact.length >= 8) return null;
  return /^\d+$/.test(compact) ? "digit" : "word";
}

export function compileTokens(manifest: Manifest): CompiledToken[] {
  return manifest.tokens.map((token) => {
    const sources = new Set<string>(token.regex);
    for (const variant of token.variants) {
      const pattern = variantPattern(variant);
      if (!pattern) continue;
      const boundary = token.match.boundary === "none" ? shortVariantBoundary(variant) : null;
      sources.add(boundary ? wrap(pattern, boundary) : pattern);
    }
    const patterns = [...sources].map((source) => new RegExp(wrap(source, token.match.boundary), "gi"));
    const squashed = token.match.squash
      ? [
          ...new Set(
            [...token.variants, ...token.regex.filter((re) => /^[a-z0-9]+$/i.test(re))]
              .map((value) => squash(normalise(value)))
              .filter((value) => value.length >= 8),
          ),
        ]
      : [];
    return { token, patterns, squashed };
  });
}

export type TokenHit = { start: number; end: number; text: string };

function clusterHits(hits: TokenHit[]): TokenHit[] {
  const sorted = [...hits].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: TokenHit[] = [];
  for (const hit of sorted) {
    const last = out[out.length - 1];
    if (last && hit.start < last.end) {
      if (hit.end > last.end) last.end = hit.end;
      continue;
    }
    out.push({ ...hit });
  }
  return out;
}

export function tokenHits(compiled: CompiledToken, layer: Layer, text: string): TokenHit[] {
  const hits: TokenHit[] = [];
  if (layer === "L6") {
    for (const needle of compiled.squashed) {
      let from = 0;
      for (;;) {
        const at = text.indexOf(needle, from);
        if (at < 0) break;
        hits.push({ start: at, end: at + needle.length, text: needle });
        from = at + 1;
      }
    }
    return clusterHits(hits);
  }
  for (const re of compiled.patterns) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (m[0].length === 0) continue;
      hits.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, text: m[0] });
    }
  }
  return clusterHits(hits);
}

export type LayerCounts = Partial<Record<Layer, number>>;

export type TokenScan = {
  tokenId: string;
  tokenClass: string;
  counts: LayerCounts;
  snippets: Array<{ layer: Layer; offset: number; snippet: string }>;
};

export type ScanResult = {
  layers: Layers;
  tokens: Map<string, TokenScan>;
};

function snippetAt(text: string, start: number, end: number): string {
  return text.slice(Math.max(0, start - 60), Math.min(text.length, end + 60)).replace(/\s+/g, " ");
}

export function scanLayers(layers: Layers, compiled: CompiledToken[]): ScanResult {
  const tokens = new Map<string, TokenScan>();
  for (const entry of compiled) {
    const scan: TokenScan = { tokenId: entry.token.id, tokenClass: entry.token.class, counts: {}, snippets: [] };
    for (const layer of LAYERS) {
      const hits = tokenHits(entry, layer, layers[layer]);
      if (hits.length === 0) continue;
      scan.counts[layer] = hits.length;
      for (const hit of hits.slice(0, 3)) {
        scan.snippets.push({ layer, offset: hit.start, snippet: snippetAt(layers[layer], hit.start, hit.end) });
      }
    }
    if (Object.keys(scan.counts).length > 0) tokens.set(entry.token.id, scan);
  }
  return { layers, tokens };
}

export function scanText(raw: string, compiled: CompiledToken[], contentType = ""): ScanResult {
  return scanLayers(decodeLayers(raw, contentType), compiled);
}

// ---------------------------------------------------------------------------
// Reflection parity (section 4.4)
// ---------------------------------------------------------------------------

/**
 * A span of a request value that carries one or more tokens, the same-length
 * control string that replaces it, and for each token the control pieces that
 * mirror exactly the sub-strings the token's patterns matched.
 */
export type ReflectedSpan = {
  tokenIds: string[];
  text: string;
  control: string;
  pieces: Record<string, string[]>;
};

export function controlFor(text: string, token: ManifestToken | undefined, alphabet: string, salt: number): string {
  if (token && (token.class === "INTERNAL_ID" || token.class === "HELD_DEAL_ID")) {
    return text.replace(/^5eed0000/i, token.control.slice(0, 8));
  }
  const base = (token?.control ?? "").toLowerCase().replace(/[^a-z]/g, "");
  let out = "";
  for (let i = 0; out.length < text.length; i += 1) {
    const ch = text[out.length];
    out += /[a-z0-9]/i.test(ch) ? (base[i] ?? alphabet[(i + salt) % alphabet.length]) : ch;
  }
  return out;
}

type RawHit = TokenHit & { token: ManifestToken };

/**
 * Finds every token span in a decoded request value, merges overlapping spans
 * and returns the value with each span replaced by its control string.
 */
export function controlValue(
  value: string,
  compiled: CompiledToken[],
  alphabet: string,
): { control: string; spans: ReflectedSpan[] } {
  const raw: RawHit[] = [];
  for (const entry of compiled) {
    for (const re of entry.patterns) {
      re.lastIndex = 0;
      for (const m of value.matchAll(re)) {
        if (!m[0]) continue;
        raw.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, text: m[0], token: entry.token });
      }
    }
  }
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Array<{ start: number; end: number; hits: RawHit[] }> = [];
  for (const hit of raw) {
    const last = merged[merged.length - 1];
    if (last && hit.start < last.end) {
      last.end = Math.max(last.end, hit.end);
      last.hits.push(hit);
      continue;
    }
    merged.push({ start: hit.start, end: hit.end, hits: [hit] });
  }
  let control = "";
  let cursor = 0;
  const spans: ReflectedSpan[] = [];
  merged.forEach((span, index) => {
    const text = value.slice(span.start, span.end);
    const primary =
      span.hits.find((h) => h.token.class === "INTERNAL_ID" || h.token.class === "HELD_DEAL_ID")?.token ??
      span.hits[0].token;
    const replacement = controlFor(text, primary, alphabet, index);
    control += value.slice(cursor, span.start) + replacement;
    cursor = span.end;
    const pieces: Record<string, string[]> = {};
    for (const hit of span.hits) {
      const piece = replacement.slice(hit.start - span.start, hit.end - span.start);
      const list = (pieces[hit.token.id] ??= []);
      if (!list.includes(piece)) list.push(piece);
    }
    spans.push({ tokenIds: Object.keys(pieces), text, control: replacement, pieces });
  });
  control += value.slice(cursor);
  return { control, spans };
}

/**
 * A pseudo-token for the control pieces of one token: the pieces are matched
 * with the same separator, case and possessive tolerance as token variants, so
 * a control echoed in a transformed form (slugified, entity-encoded) is
 * counted exactly as the token would be.
 */
export function compileControl(token: ManifestToken, pieces: string[]): CompiledToken {
  const sources = new Set<string>();
  for (const piece of pieces) {
    if (!piece) continue;
    // variantPattern drops separators outside its class (`/`, `,`). The literal
    // piece is what the control request actually echoed.
    sources.add(escapeRe(piece));
    // T04's regex treats `@` and `%40` as the same token. A control echoed
    // through a query string is percent-encoded; count that form too (§4.4).
    if (piece.includes("@")) sources.add(escapeRe(piece).replaceAll("@", "(?:@|%40)"));
    const variant = variantPattern(piece);
    if (variant) sources.add(variant);
  }
  const patterns = [...sources].map((source) => new RegExp(wrap(source, token.match.boundary), "gi"));
  const squashed = token.match.squash
    ? [...new Set(pieces.map((piece) => squash(normalise(piece))).filter((v) => v.length >= 8))]
    : [];
  return { token, patterns, squashed };
}

export function controlCounts(layers: Layers, control: CompiledToken): LayerCounts {
  const counts: LayerCounts = {};
  for (const layer of LAYERS) {
    const n = tokenHits(control, layer, layers[layer]).length;
    if (n > 0) counts[layer] = n;
  }
  return counts;
}

export type ParityRow = {
  tokenId: string;
  layer: Layer;
  probeCount: number;
  controlCount: number;
  pass: boolean;
};

export type ParityVerdict = {
  pass: boolean;
  rows: ParityRow[];
  /** Forbidden tokens the request did not carry: any count is a leak. */
  unreflected: Array<{ tokenId: string; counts: LayerCounts }>;
};

/**
 * Section 4.4. For every forbidden token the request carries, the probe
 * response may contain it at most as often, per layer, as the control
 * response contains the control pieces that replaced it. Forbidden tokens the
 * request does not carry must not appear at all. With no control response,
 * every reflected count fails.
 */
export function reflectionParity(input: {
  probe: ScanResult;
  control: ScanResult | null;
  spans: ReflectedSpan[];
  tokens: Map<string, ManifestToken>;
  forbidden: (tokenId: string) => boolean;
}): ParityVerdict {
  const rows: ParityRow[] = [];
  const unreflected: ParityVerdict["unreflected"] = [];
  const pieces = new Map<string, string[]>();
  for (const span of input.spans) {
    for (const [tokenId, list] of Object.entries(span.pieces)) {
      pieces.set(tokenId, [...(pieces.get(tokenId) ?? []), ...list]);
    }
  }
  for (const [tokenId, scan] of input.probe.tokens) {
    if (!input.forbidden(tokenId)) continue;
    const list = pieces.get(tokenId);
    const token = input.tokens.get(tokenId);
    if (!list || !token) {
      unreflected.push({ tokenId, counts: scan.counts });
      continue;
    }
    const counts = input.control ? controlCounts(input.control.layers, compileControl(token, list)) : {};
    for (const layer of LAYERS) {
      const probeCount = scan.counts[layer] ?? 0;
      if (probeCount === 0) continue;
      const controlCount = counts[layer] ?? 0;
      rows.push({ tokenId, layer, probeCount, controlCount, pass: input.control !== null && probeCount <= controlCount });
    }
  }
  return { pass: unreflected.length === 0 && rows.every((row) => row.pass), rows, unreflected };
}

// ---------------------------------------------------------------------------
// Report-only heuristics (section 4.5)
// ---------------------------------------------------------------------------

const HEURISTICS: Array<[string, RegExp]> = [
  ["portal_name", /\b(?:find a tender|contracts finder|public contracts scotland|sell2wales|etenders ?ni|delta e-?sourcing|procontract|in-tend|proactis|jaggaer|atamis|mytenders|eu-supply|etenderwales)\b/gi],
  ["external_url", /https?:\/\/(?!(?:127\.0\.0\.1|localhost|schema\.org|www\.w3\.org|w3\.org)[:/])[a-z0-9.-]+\.[a-z]{2,}[^\s"'<>]*/gi],
  ["gov_domain", /\b[a-z0-9-]+\.(?:gov|nhs|police|mod)\.uk\b/gi],
  ["ocid_shape", /\bocds-[a-z0-9]{6}-[a-z0-9-]+/gi],
  ["email", /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi],
  ["uk_phone", /(?:\+44\s?|\b0)(?:\d\s?){9,10}\b/g],
  ["org_suffix", /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Ltd|Limited|LLP|PLC|plc)\b/g],
  ["reference_shape", /\b[A-Z]{2,}[-/][A-Z0-9]{2,}[-/]\d{3,}\b/g],
  ["exact_date", /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/g],
];

export function heuristicHits(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, re] of HEURISTICS) {
    re.lastIndex = 0;
    const found = [...new Set([...text.matchAll(re)].map((m) => m[0]))];
    if (found.length) out[name] = found.slice(0, 5);
  }
  return out;
}

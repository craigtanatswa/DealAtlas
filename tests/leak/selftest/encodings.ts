/**
 * PF-04 encoding self-test and PF-05 mutation fuzz (spec 4.6). Pure: the
 * corpus comes from the caller (PF-02 baseline responses in CI, the files in
 * ./fixtures for the unit test).
 */
import { compileTokens, scanText, type CompiledToken, type Manifest, type ManifestToken } from "../lib/scan";

type Encoded = { body: string; contentType?: string };
export type Encoding = { name: string; applies?: (token: ManifestToken) => boolean; encode: (value: string) => Encoded };

const hex = (ch: string) => ch.codePointAt(0)!.toString(16).padStart(4, "0");
const firstAlnum = (value: string) => value.search(/[A-Za-z0-9]/);
const replaceFirstAlnum = (value: string, fn: (ch: string) => string) => {
  const at = firstAlnum(value);
  return at < 0 ? value : value.slice(0, at) + fn(value[at]) + value.slice(at + 1);
};
const b64url = (text: string) => Buffer.from(text).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const html = (inner: string): Encoded => ({ body: `<html><body><main><p> ${inner} </p></main></body></html>`, contentType: "text/html" });

export const ENCODINGS: Encoding[] = [
  { name: "raw", encode: (v) => html(v) },
  { name: "upper", encode: (v) => html(v.toUpperCase()) },
  { name: "title", encode: (v) => html(v.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase())) },
  { name: "html_entity", encode: (v) => html(replaceFirstAlnum(v, (ch) => `&#x${hex(ch)};`)) },
  { name: "json_unicode", encode: (v) => html(`"${replaceFirstAlnum(v, (ch) => `\\u${hex(ch)}`)}"`) },
  { name: "double_escaped", encode: (v) => html(`"${replaceFirstAlnum(v, (ch) => `\\\\u${hex(ch)}`)}"`) },
  { name: "url_encoded", encode: (v) => html(`/deals?q=${[...Buffer.from(v)].map((b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`).join("")}`) },
  {
    name: "next_f_chunk",
    encode: (v) => ({
      body: `<html><body><main></main><script>self.__next_f.push([1,${JSON.stringify(`5:["$","p",null,{"children":${JSON.stringify(v)}}]\n`)}])</script></body></html>`,
      contentType: "text/html",
    }),
  },
  { name: "x_component_row", encode: (v) => ({ body: `0:["$","p",null,{"children":${JSON.stringify(v)}}]\n`, contentType: "text/x-component" }) },
  { name: "zero_width_split", encode: (v) => html(replaceFirstAlnum(v, (ch) => `${ch}\u200b`)) },
  { name: "nbsp", encode: (v) => html(`\u00a0${v.replace(/ /g, "\u00a0")}\u00a0`) },
  { name: "curly_possessive", encode: (v) => html(`${v}\u2019s`) },
  { name: "slug", encode: (v) => html(`/deals/${v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-4c1e9a07`) },
  { name: "squashed", applies: (t) => t.match.squash, encode: (v) => html(v.toLowerCase().replace(/[^a-z0-9]/g, "")) },
  {
    name: "base64_cookie",
    encode: (v) => ({ body: `set-cookie: sb-leak-auth-token=base64-${Buffer.from(JSON.stringify({ user: { name: v } })).toString("base64")}; Path=/`, contentType: "text/plain" }),
  },
  {
    name: "jwt_payload",
    encode: (v) => ({ body: `authorization: Bearer ${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify({ sub: "leak", name: v }))}.c2lnbmF0dXJlLXNpZ25hdHVyZQ`, contentType: "text/plain" }),
  },
];

export type SelfTestCase = { token_id: string; encoding: string; detected: boolean; found: string[] };

export function encodingSelfTest(manifest: Manifest, cleanCorpus: Array<{ name: string; body: string; contentType?: string }>) {
  const compiled = compileTokens(manifest);
  const cases: SelfTestCase[] = [];
  const skipped: Array<{ token_id: string; encoding: string; reason: string }> = [];
  for (const token of manifest.tokens) {
    for (const enc of ENCODINGS) {
      if (enc.applies && !enc.applies(token)) {
        skipped.push({ token_id: token.id, encoding: enc.name, reason: "token is not squash-matched (manifest match.squash=false)" });
        continue;
      }
      const { body, contentType } = enc.encode(token.canonical);
      const found = [...scanText(body, compiled, contentType).tokens.keys()];
      cases.push({ token_id: token.id, encoding: enc.name, detected: found.includes(token.id), found });
    }
  }
  const falsePositives = cleanCorpus
    .map((doc) => ({ name: doc.name, found: [...scanText(doc.body, compiled, doc.contentType).tokens.keys()] }))
    .filter((doc) => doc.found.length > 0);
  const missed = cases.filter((c) => !c.detected);
  return { pass: missed.length === 0 && falsePositives.length === 0 && cleanCorpus.length >= 20, cases: cases.length, missed, skipped, clean_documents: cleanCorpus.length, false_positives: falsePositives };
}

/** Deterministic PRNG so a failing fuzz run can be replayed from its recorded seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Insertion points between characters that cannot join a token to its neighbours. */
function safeOffsets(body: string): number[] {
  const out: number[] = [];
  for (let i = 1; i < body.length; i += 1) {
    if (body[i - 1] === ">" && body[i] !== "<") out.push(i);
    else if (body[i - 1] === " " && body[i] === " ") out.push(i);
  }
  return out.length ? out : [body.length];
}

export function mutationFuzz(
  manifest: Manifest,
  corpus: Array<{ name: string; body: string; contentType?: string }>,
  options: { seed: number; iterations: number },
) {
  const compiled: CompiledToken[] = compileTokens(manifest);
  const rand = mulberry32(options.seed);
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
  const docs = corpus.slice(0, 10);
  const textEncodings = ENCODINGS.filter((e) => !["x_component_row", "base64_cookie", "jwt_payload"].includes(e.name));
  const iterations: Array<{ i: number; doc: string; token_id: string; variant: string; encoding: string; offset: number; detected: boolean }> = [];
  for (let i = 0; i < options.iterations; i += 1) {
    const doc = pick(docs);
    const token = pick(manifest.tokens);
    const variant = pick([token.canonical, ...token.variants]);
    const enc = pick(textEncodings.filter((e) => !e.applies || e.applies(token)));
    const inner = enc.encode(variant).body.replace(/^<html><body><main><p> | <\/p><\/main><\/body><\/html>$/g, "");
    const snippet = enc.name === "next_f_chunk" ? enc.encode(variant).body.replace(/^<html><body><main><\/main>|<\/body><\/html>$/g, "") : ` ${inner} `;
    const offsets = safeOffsets(doc.body);
    const offset = pick(offsets);
    const body = doc.body.slice(0, offset) + snippet + doc.body.slice(offset);
    const found = scanText(body, compiled, doc.contentType).tokens;
    iterations.push({ i, doc: doc.name, token_id: token.id, variant, encoding: enc.name, offset, detected: found.has(token.id) });
  }
  const missed = iterations.filter((it) => !it.detected);
  return { pass: docs.length > 0 && missed.length === 0, seed: options.seed, iterations: iterations.length, missed, log: iterations };
}

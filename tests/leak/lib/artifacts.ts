/**
 * Artifact layout (spec section 8). Scanning always happens before redaction:
 * only the dumps written here are redacted.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { ROOT } from "./env";
import type { HttpHop } from "./http";
import type { Layers } from "./scan";

export const ARTIFACTS_DIR = path.join(ROOT, "leak-artifacts");
/** Raw dumps; report.ts packs this into leak-raw-<sha7>-<run_id>.tar.gz. */
export const RAW_DIR = path.join(ARTIFACTS_DIR, "raw");

export function sha256(text: string | Buffer): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function redactValue(value: string): string {
  return `sha256:${sha256(value).slice(0, 12)}`;
}

const SECRET_HEADERS = new Set(["authorization", "apikey", "cookie", "set-cookie"]);
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const SSR_COOKIE = /base64-[A-Za-z0-9+/=_-]{40,}/g;
const SB_KEY = /sb_(?:secret|publishable)_[A-Za-z0-9_-]{10,}/g;

export function redactText(text: string): string {
  return text.replace(JWT, (m) => redactValue(m)).replace(SSR_COOKIE, (m) => redactValue(m)).replace(SB_KEY, (m) => redactValue(m));
}

export function redactHeaders(headers: Record<string, string> | Array<[string, string]>): Record<string, string> {
  const entries = Array.isArray(headers) ? headers : Object.entries(headers);
  const out: Record<string, string> = {};
  for (const [name, value] of entries) {
    const key = name.toLowerCase();
    const redacted = SECRET_HEADERS.has(key) ? redactValue(value) : redactText(value);
    out[key] = out[key] ? `${out[key]}\n${redacted}` : redacted;
  }
  return out;
}

export function safeName(text: string): string {
  return text.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
}

export function writeJson(rel: string, value: unknown): void {
  const file = path.join(ARTIFACTS_DIR, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson<T>(rel: string): T | null {
  const file = path.join(ARTIFACTS_DIR, rel);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : null;
}

export function writeRaw(rel: string, content: string): string {
  const file = path.join(RAW_DIR, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, redactText(content));
  return rel;
}

export function writeHops(base: string, hops: HttpHop[]): { body: string; headers: string; hops: string } {
  const final = hops[hops.length - 1];
  return {
    body: writeRaw(`${base}.body`, final.body),
    headers: writeRaw(`${base}.headers.json`, JSON.stringify(redactHeaders(final.headers), null, 2)),
    hops: writeRaw(
      `${base}.hops.json`,
      JSON.stringify(
        hops.map((hop) => ({
          url: hop.url,
          method: hop.method,
          status: hop.status,
          headers: redactHeaders(hop.headers),
          bytes: Buffer.byteLength(hop.body),
          sha256: sha256(hop.body),
        })),
        null,
        2,
      ),
    ),
  };
}

/** Layers are written for probes with any token match or failure; identical layers point at their twin. */
export function writeLayers(base: string, layers: Layers): string[] {
  const written: string[] = [];
  const seen = new Map<string, string>();
  for (const [layer, text] of Object.entries(layers)) {
    if (layer === "L0") continue;
    const digest = sha256(text);
    const twin = seen.get(digest);
    written.push(writeRaw(`${base}.layers/${layer}.txt`, twin ? `@same-as ${twin}\n` : text));
    if (!twin) seen.set(digest, layer);
  }
  return written;
}

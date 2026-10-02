#!/usr/bin/env node
/**
 * CI safety guard: fail when the job environment (or a `.env*` file in the
 * checkout) points at a hosted/production Supabase project or other live
 * service instead of localhost.
 *
 * Runs with plain Node (no install needed) so it can be the first CI step.
 * Violation messages never include secret values.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
  "host.docker.internal",
]);

const HOSTED_HOST_PATTERNS = [
  /(^|\.)supabase\.(co|com|in|net)$/i,
  /(^|\.)dealatlas\.uk$/i,
  /(^|\.)vercel\.app$/i,
];

/**
 * SHA-256 digests of the default credentials every local `supabase start`
 * stack ships with (a publishable and a secret key). They are public constants
 * baked into the Supabase CLI, not secrets, but are stored as digests so the
 * repo never contains key-shaped strings that secret scanners flag. If a CLI
 * upgrade changes the defaults the guard fails loudly in the DB/E2E jobs and
 * this list needs updating.
 */
export const LOCAL_DEMO_KEY_SHA256 = new Set([
  "9705102db0d5f99ee08daa19a73e510d9877a2a9add9369da247cbbe6c2a0140",
  "c85debb55f2f204d868cc1552c42faa143b4c675f61363ab040dd50b5b5304cd",
]);

function isLocalDemoKey(value) {
  return LOCAL_DEMO_KEY_SHA256.has(
    createHash("sha256").update(value).digest("hex"),
  );
}

const PLACEHOLDER_KEY = /^ci-placeholder-[a-z0-9-]+$/;
const HOSTED_FORMAT_KEY = /^sb_(publishable|secret)_/;

/** Variables injected by GitHub/the runner (branch names, refs, URLs, ...). */
const IGNORED_VAR = /^(GITHUB_|RUNNER_|ACTIONS_|INPUT_|npm_)/;

const SUPABASE_VAR = /(SUPABASE|DB_TEST)/i;
const URL_VAR = /(^|_)URL$/;
const KEY_VAR = /(KEY|SECRET|TOKEN|JWT)/i;
/** Names whose values are expected to carry a hostname. */
const HOSTLIKE_VAR = /(URL|URI|HOST|ORIGIN|DOMAIN|ENDPOINT|DSN|SUPABASE|DB_TEST|NEXT_PUBLIC)/i;

const ENV_FILE = /^\.env(\..+)?$/;
const ENV_TEMPLATE_FILE = /\.(example|sample|template|dist)$/i;
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".vercel", "playwright-report", "test-results"]);

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function jwtPayload(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function isAllowedSupabaseKey(value) {
  if (PLACEHOLDER_KEY.test(value) || isLocalDemoKey(value)) return true;
  const payload = jwtPayload(value);
  return Boolean(
    payload && payload.iss === "supabase-demo" && typeof payload.ref !== "string",
  );
}

function describeBadKey(name, value) {
  const payload = jwtPayload(value);
  if (payload && typeof payload.ref === "string") {
    return `${name} is a JWT for hosted Supabase project ref "${payload.ref}"`;
  }
  if (HOSTED_FORMAT_KEY.test(value)) {
    return `${name} is a hosted-format Supabase key (not a local CLI default or ci-placeholder-*)`;
  }
  return `${name} is a Supabase credential that is not a local CLI default or ci-placeholder-*`;
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} [label] prefix for messages, e.g. the file the vars came from
 * @returns {string[]} human-readable violations (never includes secret values)
 */
export function findProductionEnvViolations(env, label = "") {
  const violations = [];
  const report = (message) => violations.push(label ? `${label}: ${message}` : message);

  for (const [name, raw] of Object.entries(env)) {
    const value = raw?.trim();
    if (!value || IGNORED_VAR.test(name)) continue;

    if (SUPABASE_VAR.test(name) && URL_VAR.test(name)) {
      const url = parseUrl(value);
      if (!url) {
        report(`${name} is not a valid URL`);
      } else if (!LOCAL_HOSTS.has(url.hostname.toLowerCase())) {
        report(
          `${name} points at non-local host "${url.hostname}"; CI must use a local Supabase stack`,
        );
      }
      continue;
    }

    if (SUPABASE_VAR.test(name) && KEY_VAR.test(name)) {
      if (!isAllowedSupabaseKey(value)) report(describeBadKey(name, value));
      continue;
    }

    if (HOSTLIKE_VAR.test(name)) {
      const hosts = value.match(/[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
      const hosted = hosts.find((host) =>
        HOSTED_HOST_PATTERNS.some((pattern) => pattern.test(host)),
      );
      if (hosted) report(`${name} references hosted host "${hosted}"`);
    }
  }

  if (env.DODO_PAYMENTS_ENVIRONMENT?.trim() === "live_mode") {
    report("DODO_PAYMENTS_ENVIRONMENT is live_mode; CI must use test_mode");
  }
  if (env.VERCEL_ENV?.trim() === "production") {
    report("VERCEL_ENV is production; CI must not run as production");
  }

  return violations;
}

/** Parses dotenv-style text into a map. Intentionally minimal; no expansion. */
export function parseEnvFile(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.lastIndexOf(quote) > 0) {
      value = value.slice(1, value.lastIndexOf(quote));
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    result[match[1]] = value;
  }
  return result;
}

function* walkEnvFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walkEnvFiles(path.join(dir, entry.name));
    } else if (
      entry.isFile() &&
      ENV_FILE.test(entry.name) &&
      !ENV_TEMPLATE_FILE.test(entry.name)
    ) {
      yield path.join(dir, entry.name);
    }
  }
}

/**
 * Scans `.env*` files under `root`, skipping `.env.example`-style templates.
 * @param {string} root
 * @returns {string[]}
 */
export function findEnvFileViolations(root) {
  const violations = [];
  for (const file of walkEnvFiles(root)) {
    const relative = path.relative(root, file) || file;
    violations.push(
      ...findProductionEnvViolations(
        parseEnvFile(fs.readFileSync(file, "utf8")),
        relative,
      ),
    );
  }
  return violations;
}

function main() {
  const violations = [
    ...findProductionEnvViolations(process.env),
    ...findEnvFileViolations(process.cwd()),
  ];
  if (violations.length > 0) {
    console.error("CI environment guard failed:");
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exit(1);
  }
  console.log("CI environment guard passed: no hosted/production env detected.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}

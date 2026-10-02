#!/usr/bin/env node
/**
 * CI safety guard: fail when the job environment points at a hosted/production
 * Supabase project (or other live service) instead of localhost.
 *
 * Runs with plain Node (no install needed) so it can be the first CI step.
 */
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

const URL_VAR = /(^|_)URL$/;
const KEY_VAR = /(KEY|SECRET|TOKEN|JWT)/i;
const SUPABASE_VAR = /(SUPABASE|DB_TEST)/i;

function isLocalHostname(hostname) {
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}

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

/**
 * @param {Record<string, string | undefined>} env
 * @returns {string[]} human-readable violations (never includes secret values)
 */
export function findProductionEnvViolations(env) {
  const violations = [];

  for (const [name, raw] of Object.entries(env)) {
    const value = raw?.trim();
    if (!value) continue;

    if (SUPABASE_VAR.test(name) && URL_VAR.test(name)) {
      const url = parseUrl(value);
      if (!url) {
        violations.push(`${name} is not a valid URL`);
      } else if (!isLocalHostname(url.hostname)) {
        violations.push(
          `${name} points at non-local host "${url.hostname}"; CI must use a local Supabase stack`,
        );
      }
      continue;
    }

    if (SUPABASE_VAR.test(name) && KEY_VAR.test(name)) {
      const payload = jwtPayload(value);
      if (payload && typeof payload.ref === "string") {
        violations.push(
          `${name} is a JWT for hosted Supabase project ref "${payload.ref}"`,
        );
      }
      continue;
    }

    // Any other variable that smuggles in a hosted hostname.
    const hostMatches = value.match(/[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
    for (const host of hostMatches) {
      if (HOSTED_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
        violations.push(`${name} references hosted host "${host}"`);
        break;
      }
    }
  }

  if (env.DODO_PAYMENTS_ENVIRONMENT?.trim() === "live_mode") {
    violations.push("DODO_PAYMENTS_ENVIRONMENT is live_mode; CI must use test_mode");
  }
  if (env.VERCEL_ENV?.trim() === "production") {
    violations.push("VERCEL_ENV is production; CI must not run as production");
  }

  return violations;
}

function main() {
  const violations = findProductionEnvViolations(process.env);
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

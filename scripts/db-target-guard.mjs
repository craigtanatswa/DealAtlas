/**
 * Refuses to run database-mutating tests against anything but a local
 * Supabase stack. Integration, pgTAP and e2e suites insert and delete rows
 * with the service role, so pointing them at production would corrupt data.
 *
 * A non-loopback target is allowed only when all of these are set:
 *   DEALATLAS_DB_TEST_ALLOW_REMOTE=1
 *   DEALATLAS_DB_TEST_REMOTE_HOST=<exact hostname of the disposable project>
 *   DEALATLAS_PROD_SUPABASE_URL or DEALATLAS_PROD_SUPABASE_PROJECT_REF
 * and the target is not the production project.
 */

const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
  "host.docker.internal",
]);

/** @param {string | undefined} value */
function blank(value) {
  return value == null || value.trim() === "";
}

/** @param {string} raw */
function parseTarget(raw) {
  try {
    return new URL(raw);
  } catch {
    try {
      return new URL(`postgres://${raw}`);
    } catch {
      return null;
    }
  }
}

/**
 * @param {string | undefined} url
 * @param {Record<string, string | undefined>} env
 * @returns {string | null} reason the target is unsafe, or null when allowed
 */
export function unsafeDbTestTargetReason(url, env = process.env) {
  if (blank(url)) {
    return null;
  }
  const target = parseTarget(String(url).trim());
  if (!target || !target.hostname) {
    return "database test target is not a valid URL";
  }
  const host = target.hostname.toLowerCase();

  const prodUrl = env.DEALATLAS_PROD_SUPABASE_URL;
  const prodHost = blank(prodUrl) ? null : parseTarget(String(prodUrl).trim())?.hostname.toLowerCase();
  const prodRef = blank(env.DEALATLAS_PROD_SUPABASE_PROJECT_REF)
    ? null
    : String(env.DEALATLAS_PROD_SUPABASE_PROJECT_REF).trim().toLowerCase();

  if ((prodHost && host === prodHost) || (prodRef && host.split(".").includes(prodRef))) {
    return `database test target ${host} is the production project`;
  }

  if (LOOPBACK_HOSTS.has(host)) {
    return null;
  }

  if (env.DEALATLAS_DB_TEST_ALLOW_REMOTE !== "1") {
    return `database test target ${host} is not local; set DEALATLAS_DB_TEST_ALLOW_REMOTE=1 only for a disposable project`;
  }
  if (blank(env.DEALATLAS_DB_TEST_REMOTE_HOST) || String(env.DEALATLAS_DB_TEST_REMOTE_HOST).trim().toLowerCase() !== host) {
    return `DEALATLAS_DB_TEST_REMOTE_HOST must equal ${host} to allow this remote test target`;
  }
  if (!prodHost && !prodRef) {
    return "set DEALATLAS_PROD_SUPABASE_URL or DEALATLAS_PROD_SUPABASE_PROJECT_REF so remote test targets can be checked against production";
  }
  return null;
}

/**
 * @param {Array<[string, string | undefined]>} targets label/url pairs
 * @param {Record<string, string | undefined>} env
 */
export function assertSafeDbTestTargets(targets, env = process.env) {
  for (const [label, url] of targets) {
    const reason = unsafeDbTestTargetReason(url, env);
    if (reason) {
      throw new Error(`Refusing to run database tests (${label}): ${reason}.`);
    }
  }
}

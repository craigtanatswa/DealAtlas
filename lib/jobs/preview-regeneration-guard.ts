/**
 * Reasons a preview regeneration must not run.
 * Production, a missing target, and any non-local database host are refused.
 */
export function previewRegenerationBlockReason(
  env: Record<string, string | undefined>,
): string | null {
  if (env.VERCEL_ENV === "production" || env.NODE_ENV === "production") {
    return "refusing to regenerate previews when the environment is production";
  }
  const urls = [env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_URL, env.DATABASE_URL].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
  if (urls.length === 0) {
    return "refusing to regenerate previews without a database target";
  }
  for (const url of urls) {
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return "refusing to regenerate previews because the database target is not a URL";
    }
    const prodUrl = env.DEALATLAS_PROD_SUPABASE_URL;
    const prodHost = prodUrl ? safeHost(prodUrl) : null;
    const prodRef = env.DEALATLAS_PROD_SUPABASE_PROJECT_REF?.trim().toLowerCase() ?? "";
    if ((prodHost && host === prodHost) || (prodRef && host.split(".").includes(prodRef))) {
      return `refusing to regenerate previews against the production project ${host}`;
    }
    const local = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", "host.docker.internal"]);
    if (!local.has(host)) {
      return `refusing to regenerate previews against non-local database ${host}`;
    }
  }
  return null;
}

function safeHost(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

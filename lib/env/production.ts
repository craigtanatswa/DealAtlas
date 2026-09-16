const LOOPBACK_HOST = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/i;

export const LIVE_FORBIDDEN_PRODUCT_IDS = new Set([
  "pdt_dealatlas_pro_monthly",
  "pdt_dealatlas_pro_annual",
]);

export const LIVE_FORBIDDEN_WEBHOOK_KEYS = new Set([
  "whsec_dGVzdF9kb2RvX3dlYmhvb2tfc2VjcmV0X2tleQ",
]);

export function isVercelProduction(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "production"
  );
}

export function shouldHideDesignSystem(
  env: Record<string, string | undefined> = {},
  host?: string | null,
): boolean {
  const nodeEnv = env.NODE_ENV ?? process.env.NODE_ENV;
  if (nodeEnv === "production") {
    return true;
  }
  const vercel = env.VERCEL ?? process.env.VERCEL;
  const vercelEnv = env.VERCEL_ENV ?? process.env.VERCEL_ENV;
  if (vercel || vercelEnv === "production" || vercelEnv === "preview") {
    return true;
  }
  const hostname = (host ?? "").split(":")[0]?.toLowerCase() ?? "";
  if (!hostname || LOOPBACK_HOST.test(hostname)) {
    return false;
  }
  return (
    hostname === "dealatlas.uk" ||
    hostname.endsWith(".dealatlas.uk") ||
    hostname.endsWith(".vercel.app")
  );
}

export function looksLikeTestDodoApiKey(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes("dodo_test") ||
    lower.startsWith("rk_test") ||
    lower.startsWith("sk_test") ||
    lower.startsWith("dop_test") ||
    lower.includes("placeholder") ||
    lower.includes("fixture")
  );
}

export function isUnsafeTransactionalFrom(
  from: string | undefined | null,
): boolean {
  if (!from?.trim()) {
    return true;
  }
  const lower = from.toLowerCase();
  return (
    lower.includes("localhost") ||
    /@example\.(com|org|net)\b/.test(lower)
  );
}

function httpsPublicUrlError(value: string | undefined, label: string): string | null {
  if (!value?.trim()) {
    return `${label} is required.`;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return `${label} must be a valid URL.`;
  }

  if (parsed.protocol !== "https:") {
    return `${label} must use HTTPS.`;
  }

  if (LOOPBACK_HOST.test(parsed.hostname)) {
    return `${label} must not be a loopback host.`;
  }

  return null;
}

export function productionPublicUrlError(
  env: Record<string, string | undefined>,
): string | null {
  if (!isVercelProduction(env)) {
    return null;
  }

  const error = httpsPublicUrlError(
    env.NEXT_PUBLIC_APP_URL,
    "NEXT_PUBLIC_APP_URL",
  );
  return error ? `${error} Vercel production requires the live public origin.` : null;
}

export type LiveDodoEnv = {
  DODO_PAYMENTS_ENVIRONMENT: "test_mode" | "live_mode";
  DODO_PAYMENTS_API_KEY?: string;
  DODO_PAYMENTS_WEBHOOK_KEY?: string;
  DODO_PAYMENTS_RETURN_URL?: string;
  DODO_PRO_MONTHLY_PRODUCT_ID?: string;
  DODO_PRO_ANNUAL_PRODUCT_ID?: string;
};

export function liveDodoConfigErrors(env: LiveDodoEnv): string[] {
  if (env.DODO_PAYMENTS_ENVIRONMENT !== "live_mode") {
    return [];
  }

  const errors: string[] = [];

  if (!env.DODO_PAYMENTS_API_KEY) {
    errors.push(
      "DODO_PAYMENTS_API_KEY is required when DODO_PAYMENTS_ENVIRONMENT=live_mode.",
    );
  } else if (looksLikeTestDodoApiKey(env.DODO_PAYMENTS_API_KEY)) {
    errors.push(
      "DODO_PAYMENTS_API_KEY looks like a test or placeholder credential; live_mode requires a live key.",
    );
  }

  if (!env.DODO_PAYMENTS_WEBHOOK_KEY) {
    errors.push(
      "DODO_PAYMENTS_WEBHOOK_KEY is required when DODO_PAYMENTS_ENVIRONMENT=live_mode.",
    );
  } else if (
    LIVE_FORBIDDEN_WEBHOOK_KEYS.has(env.DODO_PAYMENTS_WEBHOOK_KEY) ||
    /placeholder|fixture/i.test(env.DODO_PAYMENTS_WEBHOOK_KEY)
  ) {
    errors.push(
      "DODO_PAYMENTS_WEBHOOK_KEY looks like a test fixture; live_mode requires the live webhook signing secret.",
    );
  }

  const returnUrlError = httpsPublicUrlError(
    env.DODO_PAYMENTS_RETURN_URL,
    "DODO_PAYMENTS_RETURN_URL",
  );
  if (returnUrlError) {
    errors.push(`${returnUrlError} live_mode requires the production checkout return URL.`);
  }

  if (!env.DODO_PRO_MONTHLY_PRODUCT_ID || !env.DODO_PRO_ANNUAL_PRODUCT_ID) {
    errors.push(
      "DODO_PRO_MONTHLY_PRODUCT_ID and DODO_PRO_ANNUAL_PRODUCT_ID are required when DODO_PAYMENTS_ENVIRONMENT=live_mode.",
    );
  } else if (
    LIVE_FORBIDDEN_PRODUCT_IDS.has(env.DODO_PRO_MONTHLY_PRODUCT_ID) ||
    LIVE_FORBIDDEN_PRODUCT_IDS.has(env.DODO_PRO_ANNUAL_PRODUCT_ID)
  ) {
    errors.push(
      "Live Dodo product IDs must come from the live catalogue, not local billing fixtures.",
    );
  }

  return errors;
}

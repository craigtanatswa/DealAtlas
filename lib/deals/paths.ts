import { sanitizeRedirectPath } from "@/lib/auth/redirect";
import { uuidSchema } from "@/lib/validation";

const INVALID_FALLBACK = "/__invalid_checkout_return__";

const STATIC_RETURN_PATHS = new Set([
  "/app",
  "/app/billing",
  "/pricing",
  "/checkout/success",
]);

const APP_DEAL_PATH =
  /^\/app\/deals\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_DEAL_PATH = /^\/deals\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function appDealPath(dealId: string): string {
  return `/app/deals/${dealId}`;
}

export function isAppDealPath(pathname: string): boolean {
  return APP_DEAL_PATH.test(pathname);
}

export function isAllowedCheckoutReturnTo(pathname: string): boolean {
  return (
    STATIC_RETURN_PATHS.has(pathname) ||
    APP_DEAL_PATH.test(pathname) ||
    PUBLIC_DEAL_PATH.test(pathname)
  );
}

/**
 * Optional post-checkout path. Open redirects are dropped rather than
 * rewritten to `/app`, so an invalid value does not change the Dodo return URL.
 */
export function parseCheckoutReturnTo(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }

  const sanitized = sanitizeRedirectPath(trimmed, INVALID_FALLBACK);
  if (sanitized === INVALID_FALLBACK) {
    return null;
  }

  const pathname = sanitized.split("?")[0] ?? sanitized;
  if (!isAllowedCheckoutReturnTo(pathname)) {
    return null;
  }

  return sanitized;
}

export function parseDealIdParam(value: unknown): string | null {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function checkoutReturnUrl(
  baseReturnUrl: string,
  returnTo: string | null,
): string {
  if (!returnTo) {
    return baseReturnUrl;
  }

  try {
    const url = new URL(baseReturnUrl);
    url.searchParams.set("next", returnTo);
    return url.toString();
  } catch {
    return baseReturnUrl;
  }
}

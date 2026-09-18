import { getPublicEnv } from "@/lib/env/public";
import {
  AUTH_CALLBACK_PATH,
  AUTH_CONFIRM_PATH,
  RESET_PASSWORD_PATH,
} from "@/lib/auth/redirect";

export function getAppOrigin(): string {
  return getPublicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

export function authCallbackUrl(): string {
  return `${getAppOrigin()}${AUTH_CALLBACK_PATH}`;
}

const LOCAL_OAUTH_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

/**
 * Prefer the form's Origin so local `npm run dev` returns to localhost
 * even when NEXT_PUBLIC_APP_URL is the production host.
 * Unknown origins fall back to the configured public origin.
 */
export function authCallbackUrlForRequest(
  originHeader: string | null | undefined,
  fallbackOrigin: string = getAppOrigin(),
): string {
  const fallback = `${fallbackOrigin.replace(/\/$/, "")}${AUTH_CALLBACK_PATH}`;
  if (!originHeader) {
    return fallback;
  }

  try {
    const origin = new URL(originHeader).origin;
    const allowed = new Set([...LOCAL_OAUTH_ORIGINS, fallbackOrigin.replace(/\/$/, "")]);
    if (allowed.has(origin)) {
      return `${origin}${AUTH_CALLBACK_PATH}`;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export function authConfirmUrl(): string {
  return `${getAppOrigin()}${AUTH_CONFIRM_PATH}`;
}

export function authResetCallbackUrl(): string {
  return `${getAppOrigin()}${AUTH_CALLBACK_PATH}?next=${RESET_PASSWORD_PATH}`;
}

export function productionAuthRedirectUrls(origin: string): string[] {
  const base = origin.replace(/\/$/, "");
  return [
    `${base}${AUTH_CALLBACK_PATH}`,
    `${base}${AUTH_CALLBACK_PATH}?next=/app`,
    `${base}${AUTH_CALLBACK_PATH}?next=/reset-password`,
    `${base}${AUTH_CONFIRM_PATH}`,
  ];
}

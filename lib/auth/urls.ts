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

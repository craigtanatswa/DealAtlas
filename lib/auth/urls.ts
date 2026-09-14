import { getPublicEnv } from "@/lib/env/public";
import {
  AUTH_CALLBACK_PATH,
  AUTH_CONFIRM_PATH,
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

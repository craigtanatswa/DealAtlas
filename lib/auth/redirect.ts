export const AUTH_HOME_PATH = "/app";
export const LOGIN_PATH = "/login";
export const SIGNUP_PATH = "/signup";
export const FORGOT_PASSWORD_PATH = "/forgot-password";
export const RESET_PASSWORD_PATH = "/reset-password";
export const VERIFY_EMAIL_PATH = "/verify-email";
export const AUTH_CALLBACK_PATH = "/auth/callback";
export const AUTH_CONFIRM_PATH = "/auth/confirm";

const MAX_REDIRECT_LENGTH = 256;

const AUTH_ENTRY_PATHS = new Set([
  LOGIN_PATH,
  SIGNUP_PATH,
  FORGOT_PASSWORD_PATH,
]);

const BLOCKED_REDIRECT_PATHS = new Set([
  AUTH_CALLBACK_PATH,
  AUTH_CONFIRM_PATH,
  LOGIN_PATH,
  SIGNUP_PATH,
  FORGOT_PASSWORD_PATH,
  RESET_PASSWORD_PATH,
  VERIFY_EMAIL_PATH,
]);

function decodeRepeated(value: string): string {
  let current = value;
  for (let index = 0; index < 4; index += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) {
        break;
      }
      current = decoded;
    } catch {
      return value;
    }
  }
  return current;
}

function pathOnly(value: string): string {
  return value.split("?")[0]?.split("#")[0] ?? value;
}

export function isProtectedAppPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function isAuthEntryPath(pathname: string): boolean {
  return AUTH_ENTRY_PATHS.has(pathname);
}

export function isAuthCallbackPath(pathname: string): boolean {
  return (
    pathname === AUTH_CALLBACK_PATH ||
    pathname === AUTH_CONFIRM_PATH ||
    pathname.startsWith(`${AUTH_CALLBACK_PATH}/`) ||
    pathname.startsWith(`${AUTH_CONFIRM_PATH}/`)
  );
}

export function sanitizeRedirectPath(
  value: string | null | undefined,
  fallback: string = AUTH_HOME_PATH,
): string {
  if (!value || value.length > MAX_REDIRECT_LENGTH) {
    return fallback;
  }

  const decoded = decodeRepeated(value).trim();
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.startsWith("/\\")) {
    return fallback;
  }
  if (
    decoded.includes("\\") ||
    decoded.includes("://") ||
    decoded.includes("@") ||
    /[\u0000-\u001F\u007F]/.test(decoded)
  ) {
    return fallback;
  }

  const pathname = pathOnly(decoded);
  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    return fallback;
  }
  if (!/^\/[A-Za-z0-9/_-]*$/.test(pathname)) {
    return fallback;
  }
  if (
    BLOCKED_REDIRECT_PATHS.has(pathname) ||
    isAuthCallbackPath(pathname)
  ) {
    return fallback;
  }

  const queryIndex = decoded.indexOf("?");
  if (queryIndex === -1) {
    return pathname;
  }

  const query = decoded.slice(queryIndex + 1).split("#")[0] ?? "";
  if (!query || query.includes("://") || query.includes("\\")) {
    return pathname;
  }
  if (!/^[A-Za-z0-9_=&%+.\-]*$/.test(query)) {
    return pathname;
  }

  return `${pathname}?${query}`;
}

export function loginPathWithNext(nextPath: string): string {
  const next = sanitizeRedirectPath(nextPath);
  return `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

export function defaultPathForAuthType(type: string | null | undefined): string {
  if (type === "recovery") {
    return RESET_PASSWORD_PATH;
  }
  return AUTH_HOME_PATH;
}

export function resolveProtectedRouteRedirect(
  pathname: string,
  isAuthenticated: boolean,
  nextValue?: string | null,
): string | null {
  if (isAuthCallbackPath(pathname)) {
    return null;
  }

  if (!isAuthenticated && (isProtectedAppPath(pathname) || isAdminPath(pathname))) {
    return loginPathWithNext(pathname);
  }

  if (isAuthenticated && isAuthEntryPath(pathname)) {
    return sanitizeRedirectPath(nextValue);
  }

  return null;
}

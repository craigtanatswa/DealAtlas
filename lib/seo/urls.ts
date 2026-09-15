import { getAppOrigin } from "@/lib/auth/urls";

export function absoluteUrl(pathname: string, origin = getAppOrigin()): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${origin.replace(/\/$/, "")}${path}`;
}

export function publicCanonicalUrl(
  pathname: string,
  origin = getAppOrigin(),
): string {
  if (pathname === "/") {
    return origin.replace(/\/$/, "");
  }
  return absoluteUrl(pathname, origin);
}

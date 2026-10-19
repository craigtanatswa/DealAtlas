import { isKnownGuideSlug } from "@/lib/analytics/events";
import { DEAL_CATEGORY_SLUGS } from "@/lib/matching/categories";

/**
 * The one path cleaner for analytics. The client before_send hook, the /ingest
 * proxy and every server-side capture use it, so a deal slug, deal ID or
 * organisation ID can never reach PostHog in a path.
 *
 * It is an allowlist: known static routes pass through, known dynamic routes
 * collapse to a placeholder, and anything else becomes "/[other]". Query
 * strings and #fragments are always removed (UTM tags are handled separately).
 * The output is idempotent: cleaning a cleaned path returns the same path.
 */

export const DEAL_PLACEHOLDER = "/deals/[deal]";
export const APP_DEAL_PLACEHOLDER = "/app/deals/[deal]";
export const OTHER_PLACEHOLDER = "/[other]";

const TOP_LEVEL_STATIC = new Set([
  "pricing",
  "how-it-works",
  "contact",
  "cookies",
  "privacy",
  "terms",
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "verify-email",
  "design-system",
]);

const APP_STATIC = new Set([
  "alerts",
  "billing",
  "buyers",
  "contracts",
  "profile",
  "renewals",
  "saved",
  "search",
  "searches",
  "settings",
  "suppliers",
]);

const APP_ORG_PLACEHOLDERS: Record<string, string> = {
  buyers: "/app/buyers/[buyer]",
  suppliers: "/app/suppliers/[supplier]",
};

const CHECKOUT_STATIC = new Set(["success", "founding-full"]);
const AUTH_STATIC = new Set(["google", "callback", "confirm"]);
const CATEGORY_SLUGS = new Set<string>(DEAL_CATEGORY_SLUGS);

function pathSegments(input: string): string[] | null {
  const cut = input.split(/[?#]/, 1)[0] ?? "";
  if (!cut.startsWith("/") || cut.startsWith("//") || cut.includes("\\")) {
    return null;
  }
  return cut.split("/").filter((segment) => segment.length > 0);
}

function cleanSegments(segments: string[]): string {
  const [first, second, ...rest] = segments;
  const depth = segments.length;

  if (first === undefined) {
    return "/";
  }

  switch (first) {
    case "deals":
      if (depth === 1) return "/deals";
      if (depth === 2 && second === "sitemap.xml") return "/deals/sitemap.xml";
      if (second === "sitemap") return "/deals/sitemap/[id]";
      return DEAL_PLACEHOLDER;
    case "app":
      if (depth === 1) return "/app";
      if (second === "deals") return APP_DEAL_PLACEHOLDER;
      if (second && depth > 2 && APP_ORG_PLACEHOLDERS[second]) {
        return APP_ORG_PLACEHOLDERS[second];
      }
      if (second && APP_STATIC.has(second)) {
        return depth === 2 ? `/app/${second}` : `/app/${second}/[id]`;
      }
      return "/app/[other]";
    case "api":
      return "/api/[api]";
    case "admin":
      return "/admin/[admin]";
    case "categories":
      if (depth === 1) return "/categories";
      if (depth === 2 && second && CATEGORY_SLUGS.has(second)) return `/categories/${second}`;
      return "/categories/[category]";
    case "guides":
      if (depth === 1) return "/guides";
      if (depth === 2 && isKnownGuideSlug(second)) return `/guides/${second}`;
      return "/guides/[guide]";
    case "checkout":
      if (depth === 1) return "/checkout";
      if (depth === 2 && second && CHECKOUT_STATIC.has(second)) return `/checkout/${second}`;
      return "/checkout/[other]";
    case "auth":
      if (depth === 2 && second && AUTH_STATIC.has(second)) return `/auth/${second}`;
      return "/auth/[other]";
    default:
      if (depth === 1 && rest.length === 0 && TOP_LEVEL_STATIC.has(first)) {
        return `/${first}`;
      }
      return OTHER_PLACEHOLDER;
  }
}

/**
 * Cleans a site-relative path ("/deals/abc?q=x#y"). Returns null when the
 * input is not a site-relative path at all.
 */
export function cleanPath(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 2048) {
    return null;
  }
  const segments = pathSegments(input.trim());
  return segments ? cleanSegments(segments) : null;
}

/** True when the cleaned path is a logged-in workspace or admin page. */
export function isWorkspacePath(cleaned: string): boolean {
  return cleaned === "/app" || cleaned.startsWith("/app/");
}

export function isAdminPath(cleaned: string): boolean {
  return cleaned === "/admin" || cleaned.startsWith("/admin/");
}

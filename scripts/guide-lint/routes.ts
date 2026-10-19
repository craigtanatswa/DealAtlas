import fs from "node:fs";
import path from "node:path";

import { indexableCategoryLandings } from "@/lib/seo/category-landings";

import type { RouteTable } from "./types";

const PAGE_FILE = /^page\.(?:tsx|ts|jsx|js|mdx)$/;

/** Every page route in the app/ tree. Route groups `(x)` are dropped; `_private` and `@slot` folders are skipped. */
export function pageRoutePatterns(appDir: string): string[][] {
  const patterns: string[][] = [];
  const walk = (dir: string, segments: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && PAGE_FILE.test(entry.name)) {
        patterns.push(segments);
        continue;
      }
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (name.startsWith("_") || name.startsWith("@")) continue;
      walk(path.join(dir, name), /^\(.+\)$/.test(name) ? segments : [...segments, name]);
    }
  };
  walk(appDir, []);
  return patterns;
}

export function isDynamicSegment(segment: string): boolean {
  return /^\[.+\]$/.test(segment);
}

export function patternKey(segments: string[]): string {
  return `/${segments.join("/")}`;
}

/**
 * Builds the route table from app/. Dynamic routes resolve only to the values
 * their page pre-renders: /guides/[slug] to published guides and
 * /categories/[slug] to `indexableCategoryLandings()` (its generateStaticParams).
 * Any other dynamic route has no known values, so a guide link to it fails.
 */
export function buildRouteTable(appDir: string, publishedGuideSlugs: Set<string>): RouteTable {
  const staticRoutes = new Set<string>();
  const dynamicRoutes: string[][] = [];
  for (const segments of pageRoutePatterns(appDir)) {
    if (segments.some(isDynamicSegment)) {
      dynamicRoutes.push(segments);
    } else {
      staticRoutes.add(segments.length === 0 ? "/" : patternKey(segments));
    }
  }
  const dynamicParams = new Map<string, Set<string>>([
    ["/guides/[slug]", new Set(publishedGuideSlugs)],
    ["/categories/[slug]", new Set(indexableCategoryLandings().map((landing) => landing.slug))],
  ]);
  return { staticRoutes, dynamicRoutes, dynamicParams };
}

/** True when a root-relative path (no query or hash) is a page this app serves. */
export function routeExists(routes: RouteTable, pathname: string): boolean {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (routes.staticRoutes.has(clean)) return true;
  const parts = clean.split("/").filter(Boolean);
  return routes.dynamicRoutes.some((segments) => {
    if (segments.length !== parts.length) return false;
    const known = routes.dynamicParams.get(patternKey(segments));
    return segments.every((segment, index) => {
      if (!isDynamicSegment(segment)) return segment === parts[index];
      return known?.has(parts[index]) ?? false;
    });
  });
}

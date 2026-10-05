import type { MetadataRoute } from "next";

import { PUBLIC_INDEXABLE_PATHS, ROBOTS_DISALLOW } from "@/lib/seo/pages";
import { absoluteUrl } from "@/lib/seo/urls";
import { indexableCategoryLandings } from "@/lib/seo/category-landings";

export function buildRobotsPolicy(origin: string): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...ROBOTS_DISALLOW],
    },
    sitemap: [
      absoluteUrl("/sitemap.xml", origin),
      absoluteUrl("/deals/sitemap.xml", origin),
    ],
    host: origin.replace(/^https?:\/\//, "").replace(/\/$/, ""),
  };
}

/** Sitemap index for `/deals/sitemap.xml`. Child files stay at `/deals/sitemap/{id}.xml`. */
export function dealsSitemapIndexXml(origin: string, pageCount: number): string {
  const pages = Math.max(1, pageCount);
  const body = Array.from({ length: pages }, (_, id) => {
    const loc = absoluteUrl(`/deals/sitemap/${id}.xml`, origin);
    return `  <sitemap><loc>${loc}</loc></sitemap>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

export function staticSitemapEntries(
  origin: string,
): MetadataRoute.Sitemap {
  const paths = [
    ...PUBLIC_INDEXABLE_PATHS,
    ...indexableCategoryLandings().map((landing) => landing.path),
  ];
  const unique = [...new Set(paths)];

  return unique.map((path) => ({
    url: path === "/" ? origin.replace(/\/$/, "") : absoluteUrl(path, origin),
    changeFrequency: path === "/" || path === "/deals" ? "daily" : "weekly",
    priority: path === "/" ? 1 : path === "/deals" ? 0.9 : 0.7,
  }));
}

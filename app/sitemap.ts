import type { MetadataRoute } from "next";

import { getAppOrigin } from "@/lib/auth/urls";
import { listPublishedGuides } from "@/lib/guides/content";
import { guideSitemapEntries, staticSitemapEntries } from "@/lib/seo/sitemap";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getAppOrigin();
  return [
    ...staticSitemapEntries(origin),
    ...guideSitemapEntries(origin, listPublishedGuides()),
  ];
}

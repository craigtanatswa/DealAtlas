import type { MetadataRoute } from "next";

import { getAppOrigin } from "@/lib/auth/urls";
import { staticSitemapEntries } from "@/lib/seo/sitemap";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return staticSitemapEntries(getAppOrigin());
}

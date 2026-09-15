import type { MetadataRoute } from "next";

import { getAppOrigin } from "@/lib/auth/urls";
import {
  countPublishedPreviewSitemapPages,
  listIndexablePreviewSitemapEntries,
} from "@/lib/search/public";
import { createSupabaseAnonymousClient } from "@/lib/supabase/anonymous";

export const dynamic = "force-dynamic";

export async function generateSitemaps() {
  try {
    const client = createSupabaseAnonymousClient();
    const pages = await countPublishedPreviewSitemapPages(client);
    return Array.from({ length: pages }, (_, index) => ({ id: String(index) }));
  } catch (error) {
    console.error("DealAtlas preview sitemap page count unavailable", error);
    return [{ id: "0" }];
  }
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  try {
    const id = Number.parseInt(await props.id, 10);
    const pageIndex = Number.isFinite(id) && id >= 0 ? id : 0;
    const origin = getAppOrigin();
    const client = createSupabaseAnonymousClient();
    const entries = await listIndexablePreviewSitemapEntries(
      client,
      origin,
      pageIndex,
    );

    return entries.map((entry) => ({
      url: entry.url,
      lastModified: entry.lastModified,
      changeFrequency: "daily" as const,
      priority: 0.6,
    }));
  } catch (error) {
    console.error("DealAtlas preview sitemap unavailable", error);
    return [];
  }
}

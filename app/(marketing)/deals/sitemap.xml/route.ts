import { getAppOrigin } from "@/lib/auth/urls";
import { dealsSitemapIndexXml } from "@/lib/seo/sitemap";
import { countPublishedPreviewSitemapPages } from "@/lib/search/public";
import { createSupabaseAnonymousClient } from "@/lib/supabase/anonymous";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const origin = getAppOrigin();
  let pages = 1;
  try {
    pages = await countPublishedPreviewSitemapPages(createSupabaseAnonymousClient());
  } catch (error) {
    console.error("DealAtlas deals sitemap index unavailable", error);
  }
  return new Response(dealsSitemapIndexXml(origin, pages), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

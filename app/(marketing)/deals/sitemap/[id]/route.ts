import { getAppOrigin } from "@/lib/auth/urls";
import { previewSitemapUrlsetXml } from "@/lib/seo/sitemap";
import {
  countPublishedPreviewSitemapPages,
  listIndexablePreviewSitemapEntries,
} from "@/lib/search/public";
import { createSupabaseAnonymousClient } from "@/lib/supabase/anonymous";

export const dynamic = "force-dynamic";

function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: rawId } = await context.params;
  const idText = rawId.endsWith(".xml") ? rawId.slice(0, -".xml".length) : rawId;
  if (!/^\d+$/.test(idText)) {
    return new Response("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const pageIndex = Number.parseInt(idText, 10);
  const origin = getAppOrigin();
  const client = createSupabaseAnonymousClient();
  let pages = 1;
  try {
    pages = await countPublishedPreviewSitemapPages(client);
  } catch (error) {
    console.error("DealAtlas preview sitemap page count unavailable", error);
  }
  if (pageIndex >= pages) {
    return new Response("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const entries = await listIndexablePreviewSitemapEntries(client, origin, pageIndex);
    return xmlResponse(previewSitemapUrlsetXml(entries));
  } catch (error) {
    console.error("DealAtlas preview sitemap unavailable", error);
    return xmlResponse(previewSitemapUrlsetXml([]));
  }
}

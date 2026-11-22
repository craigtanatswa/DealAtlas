import "server-only";

import { unstable_cache } from "next/cache";

import type { PublicDealPreview, PublicDealSearchResult } from "@/lib/search/dto";
import {
  getPublicDealPreviewBySlug,
  searchLiveHomePreviews,
} from "@/lib/search/public";
import { createSupabaseAnonymousClient } from "@/lib/supabase/anonymous";

export const getCachedHomeLivePreviews = unstable_cache(
  (): Promise<PublicDealSearchResult> =>
    searchLiveHomePreviews(createSupabaseAnonymousClient()),
  ["home-live-previews-v1"],
  { revalidate: 300, tags: ["public-preview"] },
);

export function getCachedPublicDealPreview(
  slug: string,
): Promise<PublicDealPreview | null> {
  return unstable_cache(
    () => getPublicDealPreviewBySlug(createSupabaseAnonymousClient(), slug),
    ["public-deal-preview-v1", slug],
    { revalidate: 300, tags: ["public-preview", `public-preview:${slug}`] },
  )();
}

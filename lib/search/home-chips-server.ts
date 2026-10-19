import "server-only";

import { unstable_cache } from "next/cache";

import {
  HOME_SEARCH_CHIP_LIMIT,
  HOME_SEARCH_CHIP_REVALIDATE_SECONDS,
  homeSearchChipCandidates,
  pickHomeSearchChips,
  type HomeSearchChip,
} from "@/lib/search/home-chips";
import { parsePublicSearchParams } from "@/lib/search/params";
import { searchPublicDealPreviews } from "@/lib/search/public";
import { createSupabaseAnonymousClient } from "@/lib/supabase/anonymous";

/**
 * Live counts use the same public search as the chip's landing page (anonymous client,
 * sanitised preview RPC), so a chip's count is what /deals shows for that link.
 * Only labels, hrefs and counts are cached; no preview content.
 */
async function countHomeSearchChips(): Promise<HomeSearchChip[]> {
  const client = createSupabaseAnonymousClient();
  const counted = await Promise.all(
    homeSearchChipCandidates().map(async (candidate) => {
      try {
        const filters = { ...parsePublicSearchParams(candidate.params), limit: 1, page: 1 };
        const result = await searchPublicDealPreviews(client, filters);
        return { label: candidate.label, href: candidate.href, count: result.total };
      } catch {
        return { label: candidate.label, href: candidate.href, count: 0 };
      }
    }),
  );
  return pickHomeSearchChips(counted, HOME_SEARCH_CHIP_LIMIT);
}

export const getHomeSearchChips = unstable_cache(countHomeSearchChips, ["home-search-chips-v1"], {
  revalidate: HOME_SEARCH_CHIP_REVALIDATE_SECONDS,
});

import { HOME_SEARCH_EXAMPLES } from "@/lib/search/home-search-examples";
import { DEAL_CATEGORY_CATALOG } from "@/lib/matching/categories";

/** A homepage "Try …" chip. Label is an existing search term or category label only. */
export type HomeSearchChip = { label: string; href: string };

export type HomeSearchChipCandidate = HomeSearchChip & {
  params: Record<string, string>;
};

export const HOME_SEARCH_CHIP_LIMIT = 6;
export const HOME_SEARCH_CHIP_REVALIDATE_SECONDS = 3600;

/** Existing curated terms first, then the existing category labels. No buyer or source text. */
export function homeSearchChipCandidates(path = "/deals"): HomeSearchChipCandidate[] {
  const terms = HOME_SEARCH_EXAMPLES.map((term) => ({
    label: term,
    href: `${path}?q=${encodeURIComponent(term)}`,
    params: { q: term },
  }));
  const categories = DEAL_CATEGORY_CATALOG.filter((item) => item.slug !== "other").map(
    (item) => ({
      label: item.name,
      href: `${path}?category=${encodeURIComponent(item.name)}`,
      params: { category: item.name },
    }),
  );
  return [...terms, ...categories];
}

/**
 * Top `limit` chips by live published-deal count. Zero (or unknown) counts are dropped,
 * so a chip never lands on an empty result page. Ties keep candidate order.
 */
export function pickHomeSearchChips(
  counted: (HomeSearchChip & { count: number | null | undefined })[],
  limit = HOME_SEARCH_CHIP_LIMIT,
): HomeSearchChip[] {
  return counted
    .map((chip, index) => ({ chip, index, count: Number(chip.count ?? 0) }))
    .filter((entry) => Number.isFinite(entry.count) && entry.count >= 1)
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(({ chip }) => ({ label: chip.label, href: chip.href }));
}

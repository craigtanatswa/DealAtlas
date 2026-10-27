/**
 * Maps free-text deal_previews.main_category values onto the fixed /deals
 * filter taxonomy. Search expands a selected filter into its raw values so
 * we do not rewrite prod data or change the RPC signature.
 *
 * Keep this module free of @/ path aliases and heavy imports so next.config
 * can call rawCategoryAliases() at build time.
 */

export const FILTER_TAXONOMY_NAMES = [
  "Technology",
  "Professional Services",
  "Construction & Infrastructure",
  "Facilities & Property",
  "Healthcare",
  "Education",
  "Transport & Logistics",
  "Manufacturing & Industrial",
  "Marketing & Creative",
  "Food & Catering",
  "Energy & Utilities",
  "Office & Business Supplies",
  "Other",
] as const;

export type FilterTaxonomyName = (typeof FILTER_TAXONOMY_NAMES)[number];

const FILTER_CATALOG: ReadonlyArray<{ slug: string; name: FilterTaxonomyName }> = [
  { slug: "technology", name: "Technology" },
  { slug: "professional-services", name: "Professional Services" },
  { slug: "construction-infrastructure", name: "Construction & Infrastructure" },
  { slug: "facilities-property", name: "Facilities & Property" },
  { slug: "healthcare", name: "Healthcare" },
  { slug: "education", name: "Education" },
  { slug: "transport-logistics", name: "Transport & Logistics" },
  { slug: "manufacturing-industrial", name: "Manufacturing & Industrial" },
  { slug: "marketing-creative", name: "Marketing & Creative" },
  { slug: "food-catering", name: "Food & Catering" },
  { slug: "energy-utilities", name: "Energy & Utilities" },
  { slug: "office-business-supplies", name: "Office & Business Supplies" },
  { slug: "other", name: "Other" },
];

function slugifyCategory(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const RAW_TO_FILTER_ENTRIES: ReadonlyArray<readonly [string, FilterTaxonomyName]> = [
  ["Technology", "Technology"],
  ["Science and Research", "Technology"],
  ["Network Services", "Technology"],
  ["Software and Hardware", "Technology"],
  ["Cloud and Hosting", "Technology"],
  ["Cloud Hosting", "Technology"],
  ["Software", "Technology"],
  ["Technology Services", "Technology"],
  ["Digital and Technology Services", "Technology"],
  ["Professional Services", "Professional Services"],
  ["Professional and Business Services", "Professional Services"],
  ["Professional And Business Services", "Professional Services"],
  ["Financial Services", "Professional Services"],
  ["HR and Workforce Services", "Professional Services"],
  ["Construction & Infrastructure", "Construction & Infrastructure"],
  ["Construction", "Construction & Infrastructure"],
  ["Cultural Infrastructure", "Construction & Infrastructure"],
  ["Housing and Regeneration", "Construction & Infrastructure"],
  ["Facilities & Property", "Facilities & Property"],
  ["Facilities Management", "Facilities & Property"],
  ["Estates Support Services", "Facilities & Property"],
  ["Healthcare", "Healthcare"],
  ["Health and Social Care", "Healthcare"],
  ["Education", "Education"],
  ["Learning and Development", "Education"],
  ["Transport & Logistics", "Transport & Logistics"],
  ["Transport", "Transport & Logistics"],
  ["Fleet", "Transport & Logistics"],
  ["Manufacturing & Industrial", "Manufacturing & Industrial"],
  ["Marketing & Creative", "Marketing & Creative"],
  ["Food & Catering", "Food & Catering"],
  ["Energy & Utilities", "Energy & Utilities"],
  ["Energy", "Energy & Utilities"],
  ["Water and Wastewater", "Energy & Utilities"],
  ["Office & Business Supplies", "Office & Business Supplies"],
  ["Other", "Other"],
  ["services", "Other"],
  ["goods", "Other"],
  ["works", "Other"],
  ["Low Value", "Other"],
  ["Justice", "Other"],
];

export const RAW_TO_FILTER: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(RAW_TO_FILTER_ENTRIES),
);

const FILTER_TO_RAWS: ReadonlyMap<string, readonly string[]> = (() => {
  const byFilter = new Map<string, Set<string>>();
  for (const [raw, filter] of RAW_TO_FILTER_ENTRIES) {
    const raws = byFilter.get(filter) ?? new Set<string>();
    raws.add(raw);
    byFilter.set(filter, raws);
  }
  return new Map(
    [...byFilter.entries()].map(([filter, raws]) => [filter, [...raws].sort()]),
  );
})();

export function mapRawCategoryToFilter(
  raw: string | null | undefined,
): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  return RAW_TO_FILTER[trimmed] ?? null;
}

export function filterNameForSlug(slug: string): string | null {
  const trimmed = slug.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  return FILTER_CATALOG.find((item) => item.slug === trimmed)?.name ?? null;
}

export function expandFilterToRawCategories(
  filterNameOrSlug: string | null | undefined,
): string[] {
  if (!filterNameOrSlug) {
    return [];
  }
  const trimmed = filterNameOrSlug.trim();
  if (!trimmed) {
    return [];
  }
  const filter = (FILTER_TAXONOMY_NAMES as readonly string[]).includes(trimmed)
    ? trimmed
    : filterNameForSlug(trimmed) ?? mapRawCategoryToFilter(trimmed);

  if (!filter) {
    return [trimmed];
  }

  return [...(FILTER_TO_RAWS.get(filter) ?? [])];
}

export function rawCategoryAliases(): Array<{
  fromSlug: string;
  toSlug: string;
  toName: string;
}> {
  const catalogSlugs = new Set<string>(FILTER_CATALOG.map((item) => item.slug));
  const aliases = new Map<
    string,
    { fromSlug: string; toSlug: string; toName: string }
  >();

  for (const [raw, filter] of RAW_TO_FILTER_ENTRIES) {
    const fromSlug = slugifyCategory(raw);
    const catalog = FILTER_CATALOG.find((item) => item.name === filter);
    if (!catalog) {
      continue;
    }
    if (fromSlug === catalog.slug || catalogSlugs.has(fromSlug)) {
      continue;
    }
    if (!aliases.has(fromSlug)) {
      aliases.set(fromSlug, {
        fromSlug,
        toSlug: catalog.slug,
        toName: catalog.name,
      });
    }
  }

  return [...aliases.values()].sort((a, b) =>
    a.fromSlug.localeCompare(b.fromSlug),
  );
}

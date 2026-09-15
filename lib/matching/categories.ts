export const DEAL_CATEGORY_CATALOG = [
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
] as const;

export type DealCategorySlug = (typeof DEAL_CATEGORY_CATALOG)[number]["slug"];

const BY_SLUG = new Map<string, (typeof DEAL_CATEGORY_CATALOG)[number]>(
  DEAL_CATEGORY_CATALOG.map((item) => [item.slug, item]),
);

const BY_NAME = new Map<string, (typeof DEAL_CATEGORY_CATALOG)[number]>(
  DEAL_CATEGORY_CATALOG.map((item) => [item.name.toLowerCase(), item]),
);

export function slugifyCategory(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveCategory(value: string | null | undefined): {
  slug: string;
  name: string;
} | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const bySlug = BY_SLUG.get(slugifyCategory(trimmed));
  if (bySlug) {
    return bySlug;
  }
  const byName = BY_NAME.get(trimmed.toLowerCase());
  if (byName) {
    return byName;
  }
  return { slug: slugifyCategory(trimmed), name: trimmed };
}

export const DEAL_CATEGORY_SLUGS = DEAL_CATEGORY_CATALOG.map((item) => item.slug);

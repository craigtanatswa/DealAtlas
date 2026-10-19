/**
 * Display helpers for free previews. Pure presentation: they only hide or
 * relabel values that are already public. Nothing here adds information.
 */

/** Raw ingest categories that are procurement classes, not sectors. */
const RAW_CATEGORY_LABELS: Record<string, string> = {
  goods: "Goods and supplies",
  works: "Construction and works",
  services: "Services",
};

/** Placeholder values that carry no information and should not render. */
const UNDISCLOSED_VALUES = new Set([
  "unknown",
  "not disclosed",
  "undisclosed",
  "not stated",
  "not known",
  "n/a",
]);

export function isUndisclosed(value: string | null | undefined): boolean {
  const text = value?.trim();
  return !text || UNDISCLOSED_VALUES.has(text.toLowerCase());
}

/** The value, or null when it is empty or a placeholder such as UNKNOWN. */
export function disclosed(value: string | null | undefined): string | null {
  return isUndisclosed(value) ? null : (value as string).trim();
}

/** Map raw goods/works/services to proper names. Other categories pass through. */
export function categoryLabel(raw: string | null | undefined): string | null {
  const text = disclosed(raw);
  if (!text) {
    return null;
  }
  return RAW_CATEGORY_LABELS[text.toLowerCase()] ?? text;
}

function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b) && a!.trim().toLowerCase() === b!.trim().toLowerCase();
}

/**
 * specificSector is hidden when it repeats the goods list or the category.
 * Today compose sets it to goods[0], so it is usually a duplicate.
 */
export function distinctSpecificSector(
  specificSector: string | null | undefined,
  goods: readonly string[],
  category: string | null | undefined,
): string | null {
  const text = disclosed(specificSector);
  if (!text) return null;
  if (goods.some((item) => same(item, text))) return null;
  if (same(category, text)) return null;
  return text;
}

/**
 * keyDates is "Closing window X. Contract term Y". Drop each part that
 * repeats a band already shown on the same surface; return what is left.
 */
export function keyDatesRemainder(
  keyDates: string | null | undefined,
  shown: { deadlineBand?: string | null; durationBand?: string | null },
): string | null {
  const text = disclosed(keyDates);
  if (!text) return null;
  const parts = text
    .split(/\.\s+/)
    .map((part) => part.replace(/\.$/, "").trim())
    .filter(Boolean)
    .filter((part) => {
      if (shown.deadlineBand && same(part, `Closing window ${shown.deadlineBand}`)) return false;
      if (shown.durationBand && same(part, `Contract term ${shown.durationBand}`)) return false;
      if (/^(closing window|contract term)\s+(not disclosed|undisclosed|unknown)$/i.test(part)) return false;
      return true;
    });
  return parts.length > 0 ? parts.join(". ") : null;
}

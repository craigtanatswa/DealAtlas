export const HOME_TEASER_LIMIT = 24;
export const HOME_TEASER_PER_SECTOR = 4;

/** Keep source order. Skip a row once its sector already has four cards. */
export function takeHomeTeaser<T>(
  items: readonly T[],
  sectorOf: (item: T) => string,
  limit = HOME_TEASER_LIMIT,
  perSector = HOME_TEASER_PER_SECTOR,
): T[] {
  const counts = new Map<string, number>();
  const picked: T[] = [];
  for (const item of items) {
    const sector = sectorOf(item) || "unknown";
    const used = counts.get(sector) ?? 0;
    if (used >= perSector) {
      continue;
    }
    counts.set(sector, used + 1);
    picked.push(item);
    if (picked.length >= limit) {
      break;
    }
  }
  return picked;
}

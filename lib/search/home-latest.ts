export const HOME_LATEST_LIMIT = 8;
export const HOME_PRIMARY_STATUSES = ["OPEN", "CLOSING_SOON", "UPCOMING"] as const;
export const HOME_FALLBACK_STATUS = "AWARDED";

/**
 * Keep biddable and upcoming listings first. Awarded rows only fill remaining slots.
 * Default search order already places OPEN and CLOSING_SOON ahead of UPCOMING.
 */
export function takeHomeLatestItems<T>(
  primary: T[],
  fallback: T[],
  key: (item: T) => string,
  limit = HOME_LATEST_LIMIT,
): T[] {
  const seen = new Set<string>();
  const items: T[] = [];

  for (const source of [primary, fallback]) {
    for (const item of source) {
      if (items.length >= limit) {
        return items;
      }
      const id = key(item);
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      items.push(item);
    }
  }

  return items;
}

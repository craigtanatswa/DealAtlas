export const HOME_LATEST_LIMIT = 8;
export const HOME_PRIMARY_STATUSES = ["OPEN", "UPCOMING"] as const;
export const HOME_FALLBACK_STATUS = "AWARDED";

/**
 * Keep open/upcoming listings first. Awarded rows only fill remaining slots.
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

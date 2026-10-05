/** RSC responses that belong to one soft navigation, including a prefetch that finished early. */

export type RscNavTracker = {
  rsc: Array<{ url: string }>;
  responses: Array<{ url: string; contentType: string; body: string }>;
};

function pathname(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

function isFlight(url: string, contentType: string, body: string): boolean {
  return (
    url.includes("_rsc=") ||
    contentType.includes("text/x-component") ||
    body.includes("__next_f")
  );
}

/** Unique flight responses for `path`, including prefetches and an inline document payload. */
export function navigationRscCount(tracker: RscNavTracker, path: string): number {
  if (!path) return 0;
  const urls = new Set<string>();
  for (const row of tracker.rsc) {
    if (pathname(row.url) === path) urls.add(row.url);
  }
  for (const row of tracker.responses) {
    if (pathname(row.url) !== path) continue;
    if (isFlight(row.url, row.contentType, row.body)) urls.add(row.url);
  }
  return urls.size;
}

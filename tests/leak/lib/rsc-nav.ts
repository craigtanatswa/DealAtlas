/** Flight responses for one soft navigation, only those recorded after the step starts. */

export type RscNavTracker = {
  rsc: Array<{ url: string }>;
  responses: Array<{ url: string; contentType: string; body: string }>;
};

/** Indexes captured at step start. Rows before them belong to an earlier load. */
export type RscNavCursor = { rsc: number; responses: number };

function pathname(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/** A real React Server Component flight. The HTML document's `__next_f` payload is not one. */
export function isRscFlight(url: string, contentType = ""): boolean {
  return url.includes("_rsc=") || contentType.includes("text/x-component");
}

/**
 * Unique flight responses for `path` added after `since`.
 * An HTML document that merely inlines `__next_f` does not count, including the
 * page RSC-03 loaded before the click.
 */
export function navigationRscCount(tracker: RscNavTracker, path: string, since: RscNavCursor): number {
  if (!path) return 0;
  const urls = new Set<string>();
  for (const row of tracker.rsc.slice(since.rsc)) {
    if (pathname(row.url) === path && isRscFlight(row.url)) urls.add(row.url);
  }
  for (const row of tracker.responses.slice(since.responses)) {
    if (pathname(row.url) !== path) continue;
    if (isRscFlight(row.url, row.contentType)) urls.add(row.url);
  }
  return urls.size;
}

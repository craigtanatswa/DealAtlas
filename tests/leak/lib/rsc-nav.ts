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
 * Next's segment cache marks every prefetch tier, including the cache-miss
 * tree fetch a click needs (`next-router-prefetch: 1` plus
 * `next-router-segment-prefetch`). A full navigation omits those headers.
 */
export function isPrefetchRequest(headers: Record<string, string>): boolean {
  const prefetch = headers["next-router-prefetch"];
  return prefetch === "1" || prefetch === "2" || prefetch === "3" || Boolean(headers["next-router-segment-prefetch"]);
}

/** Pathname whose prefetch may run during the current step. Other prefetches stay blocked. */
export type PrefetchAllow = { exact?: string; prefix?: string };

function prefixMatches(path: string, prefix: string): boolean {
  const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return path === base || path.startsWith(`${base}/`);
}

/**
 * Drop prefetches that would fill the client cache before this step's click.
 * A prefetch for the step's own target is kept: that request is the soft-nav
 * flight, not an earlier viewport prefetch.
 */
export function abortPrefetch(headers: Record<string, string>, url: string, allow: PrefetchAllow | null): boolean {
  if (!isPrefetchRequest(headers)) return false;
  if (!allow) return true;
  const path = pathname(url);
  if (!path) return true;
  if (allow.exact && path === allow.exact) return false;
  if (allow.prefix && prefixMatches(path, allow.prefix)) return false;
  return true;
}

/**
 * Body of a `new Function("roots", ...)` that walks React fibers from DOM nodes
 * and returns the App Router instance (`push` / `bfcacheId`), or null.
 * Kept as a string so Playwright can run it in the page without the compiler's
 * `__name` helper.
 */
export const APP_ROUTER_FROM_NODES_SOURCE = `function isAppRouter(value) {
  return !!value && typeof value === "object"
    && typeof value.push === "function"
    && typeof value.replace === "function"
    && typeof value.refresh === "function"
    && typeof value.back === "function"
    && typeof value.prefetch === "function"
    && typeof value.bfcacheId === "string";
}
function routerFromFiber(start) {
  var seen = new Set();
  var fiber = start;
  while (fiber && !seen.has(fiber)) {
    seen.add(fiber);
    var deps = fiber.dependencies;
    var ctx = deps && deps.firstContext;
    while (ctx) {
      if (isAppRouter(ctx.memoizedValue)) return ctx.memoizedValue;
      ctx = ctx.next;
    }
    var alt = fiber.alternate;
    if (alt && !seen.has(alt)) {
      seen.add(alt);
      var altDeps = alt.dependencies;
      var altCtx = altDeps && altDeps.firstContext;
      while (altCtx) {
        if (isAppRouter(altCtx.memoizedValue)) return altCtx.memoizedValue;
        altCtx = altCtx.next;
      }
    }
    fiber = fiber.return;
  }
  return null;
}
for (var i = 0; i < roots.length; i++) {
  var node = roots[i];
  if (!node) continue;
  var keys = Object.keys(node);
  for (var k = 0; k < keys.length; k++) {
    if (keys[k].indexOf("__reactFiber$") === 0) {
      var found = routerFromFiber(node[keys[k]]);
      if (found) return found;
    }
  }
}
return null;`;

export const appRouterFromNodes = new Function("roots", APP_ROUTER_FROM_NODES_SOURCE) as (
  roots: object[],
) => { push: (href: string) => void } | null;

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

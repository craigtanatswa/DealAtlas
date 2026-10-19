import type { Page, Request } from "@playwright/test";

import { decodeIngestBody } from "../../../lib/analytics/ingest-proxy";

export type CapturedIngest = { url: string; body: string; events: unknown[] };

function decode(request: Request): CapturedIngest {
  const buffer = request.postDataBuffer() ?? Buffer.alloc(0);
  const url = new URL(request.url());
  let decoded: unknown = null;
  try {
    decoded = buffer.length
      ? decodeIngestBody(
          new Uint8Array(buffer),
          request.headers()["content-type"] ?? null,
          url.searchParams.get("compression"),
        )
      : null;
  } catch {
    decoded = buffer.toString("utf8");
  }
  const events = Array.isArray(decoded)
    ? decoded
    : decoded && typeof decoded === "object" && Array.isArray((decoded as { batch?: unknown }).batch)
      ? ((decoded as { batch: unknown[] }).batch)
      : decoded
        ? [decoded]
        : [];
  return {
    url: url.pathname + url.search,
    body: typeof decoded === "string" ? decoded : JSON.stringify(decoded),
    events,
  };
}

/**
 * Captures every browser request to the /ingest proxy (fetch, XHR and
 * sendBeacon) and answers routed ones locally. Beacons that bypass routing
 * reach the app's proxy, which forwards nothing while
 * DEALATLAS_ANALYTICS_UPSTREAM is off.
 */
export async function captureIngest(page: Page): Promise<CapturedIngest[]> {
  const captured: CapturedIngest[] = [];
  // posthog-js drops events from automated browsers (navigator.webdriver,
  // HeadlessChrome brands). Present as a normal browser so the real payloads
  // are produced and can be inspected.
  await page.addInitScript({
    content:
      'Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });' +
      'Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => undefined });',
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/ingest")) {
      captured.push(decode(request));
    }
  });
  await page.route("**/ingest/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: 1 }),
    }),
  );
  return captured;
}

export function capturedPathnames(captured: CapturedIngest[]): string[] {
  return captured.flatMap((request) =>
    request.events.map((event) => {
      const properties = (event as { properties?: { $pathname?: unknown } }).properties;
      return typeof properties?.$pathname === "string" ? properties.$pathname : "";
    }),
  );
}

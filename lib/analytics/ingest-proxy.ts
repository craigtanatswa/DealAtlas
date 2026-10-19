import { gunzipSync } from "node:zlib";

import { sanitizeClientEvent, normalizeOrigin, type SanitizedClientEvent } from "@/lib/analytics/sanitize";

/**
 * /ingest proxy core. Browser events are decoded, run through the same
 * fail-closed allowlist as the client before_send hook, and only then
 * forwarded to PostHog EU as plain JSON. No cookies, auth headers or client
 * IP are forwarded.
 */

export const INGEST_EVENT_PATHS = new Set(["e", "i/v0/e", "batch"]);
export const MAX_INGEST_BODY_BYTES = 512 * 1024;

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** Decodes the posthog-js request body (JSON, gzip-js or base64 form). */
export function decodeIngestBody(
  bytes: Uint8Array,
  contentType: string | null,
  compression: string | null,
): unknown {
  let text: string;
  if (isGzip(bytes)) {
    text = gunzipSync(bytes, { maxOutputLength: MAX_INGEST_BODY_BYTES * 8 }).toString("utf8");
  } else {
    text = Buffer.from(bytes).toString("utf8");
  }

  if ((contentType ?? "").includes("application/x-www-form-urlencoded")) {
    const data = new URLSearchParams(text).get("data");
    if (data === null) {
      return null;
    }
    text = compression === "base64" ? Buffer.from(data, "base64").toString("utf8") : data;
  }
  return JSON.parse(text);
}

function eventList(decoded: unknown): unknown[] {
  if (Array.isArray(decoded)) {
    return decoded;
  }
  if (decoded && typeof decoded === "object") {
    const batch = (decoded as { batch?: unknown }).batch;
    return Array.isArray(batch) ? batch : [decoded];
  }
  return [];
}

function currentUrlOrigin(event: unknown): string | null {
  if (!event || typeof event !== "object") {
    return null;
  }
  const properties = (event as { properties?: unknown }).properties;
  if (!properties || typeof properties !== "object") {
    return null;
  }
  const url = (properties as { $current_url?: unknown }).$current_url;
  return typeof url === "string" ? normalizeOrigin(url) : null;
}

/** Sanitizes every event; an event whose page origin is not ours is dropped. */
export function sanitizeIngestEvents(
  decoded: unknown,
  allowedOrigins: ReadonlySet<string>,
): SanitizedClientEvent[] {
  const sanitized: SanitizedClientEvent[] = [];
  for (const event of eventList(decoded).slice(0, 100)) {
    const origin = currentUrlOrigin(event);
    if (!origin || !allowedOrigins.has(origin)) {
      continue;
    }
    const clean = sanitizeClientEvent(event, { origin });
    if (clean) {
      sanitized.push(clean);
    }
  }
  return sanitized;
}

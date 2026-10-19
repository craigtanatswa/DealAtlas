import "server-only";

import { POSTHOG_EU_API_HOST, configuredPostHogKey } from "@/lib/analytics/config";
import { serverCaptureBody, type ServerEvent } from "@/lib/analytics/server-events";

const CAPTURE_TIMEOUT_MS = 2_000;

/**
 * The server talks to PostHog (server events and /ingest forwarding) only when
 * NEXT_PUBLIC_POSTHOG_KEY is valid and DEALATLAS_ANALYTICS_UPSTREAM is not
 * "off" (the E2E server runs with it off so nothing leaves CI).
 */
export function serverAnalyticsKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (env.DEALATLAS_ANALYTICS_UPSTREAM?.trim().toLowerCase() === "off") {
    return null;
  }
  return configuredPostHogKey(env);
}

/** Best effort: analytics must never fail or slow a sign-up or a webhook. */
export async function captureServerEvent(
  event: ServerEvent | null,
  options: { fetchImpl?: typeof fetch; env?: Record<string, string | undefined> } = {},
): Promise<void> {
  const apiKey = serverAnalyticsKey(options.env);
  if (!event || !apiKey) {
    return;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    await fetchImpl(`${POSTHOG_EU_API_HOST}/i/v0/e/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(serverCaptureBody(apiKey, event, new Date())),
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    // Dropped on purpose.
  }
}

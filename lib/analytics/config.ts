import type { PostHogConfig } from "posthog-js/dist/module.slim.no-external";

import { isPostHogProjectKey, sanitizeClientEvent } from "@/lib/analytics/sanitize";

/** Browser traffic goes through our own /ingest proxy to the EU region. */
export const POSTHOG_INGEST_PATH = "/ingest";
export const POSTHOG_EU_API_HOST = "https://eu.i.posthog.com";
export const POSTHOG_EU_UI_HOST = "https://eu.posthog.com";

const POSTHOG_KEY_ENV = "NEXT_PUBLIC_POSTHOG_KEY";

/**
 * The configured key, read from the server's environment at request time
 * (indexed access, so the build does not inline it). The server passes it to
 * the client as a prop.
 */
export function configuredPostHogKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return analyticsKeyOrNull(env[POSTHOG_KEY_ENV]);
}

/** Analytics is enabled only by a valid NEXT_PUBLIC_POSTHOG_KEY. */
export function analyticsKeyOrNull(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed && isPostHogProjectKey(trimmed) ? trimmed : null;
}

/**
 * Client SDK settings (Security condition 4). The slim, no-external build is
 * used, so autocapture, replay, heatmaps, dead clicks, web vitals, exception
 * capture, surveys and the toolbar are not even in the bundle; the flags below
 * switch them off as well in case a future build adds them back.
 */
export function buildPostHogClientConfig(origin: string): Partial<PostHogConfig> {
  return {
    api_host: POSTHOG_INGEST_PATH,
    ui_host: POSTHOG_EU_UI_HOST,
    // No cookies or localStorage at all: identity lives in memory for the tab.
    persistence: "memory",
    disable_persistence: true,
    person_profiles: "identified_only",
    // $pageview is captured manually on every App Router navigation.
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    enable_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    disable_session_recording: true,
    enable_recording_console_log: false,
    disable_surveys: true,
    disable_surveys_automatic_display: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    advanced_disable_feature_flags: true,
    advanced_disable_feature_flags_on_first_load: true,
    advanced_disable_toolbar_metrics: true,
    disable_scroll_properties: true,
    save_referrer: false,
    save_campaign_params: false,
    mask_all_text: true,
    mask_all_element_attributes: true,
    mask_personal_data_properties: true,
    bootstrap: {},
    before_send: (event) => {
      if (!event) {
        return null;
      }
      // The SDK types this loosely; our sanitizer returns a fresh object.
      return sanitizeClientEvent(event, { origin }) as unknown as typeof event | null;
    },
  };
}

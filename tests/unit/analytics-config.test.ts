import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { analyticsKeyOrNull, buildPostHogClientConfig } from "@/lib/analytics/config";

describe("PostHog client config", () => {
  it("is disabled without a valid key", () => {
    expect(analyticsKeyOrNull(undefined)).toBeNull();
    expect(analyticsKeyOrNull("")).toBeNull();
    expect(analyticsKeyOrNull("  ")).toBeNull();
    expect(analyticsKeyOrNull("sk_live_123")).toBeNull();
    expect(analyticsKeyOrNull("phc_ASE9shKGUYapQZi8ynPfJnVvQtndN29HjDjKkcSP8mWT")).toBe(
      "phc_ASE9shKGUYapQZi8ynPfJnVvQtndN29HjDjKkcSP8mWT",
    );
  });

  it("keeps every Security-listed SDK feature off and stores nothing", () => {
    const config = buildPostHogClientConfig("https://www.dealatlas.uk");
    expect(config).toMatchObject({
      api_host: "/ingest",
      persistence: "memory",
      disable_persistence: true,
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
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
      capture_pageleave: false,
      bootstrap: {},
    });
    expect(typeof config.before_send).toBe("function");
  });

  it("loads only the slim, no-external SDK build", () => {
    const source = readFileSync("components/analytics/posthog-analytics.tsx", "utf8");
    const imports = source.match(/import\(\s*"posthog-js[^"]*"\s*\)/g) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    for (const statement of imports) {
      expect(statement).toContain("posthog-js/dist/module.slim.no-external");
    }
    expect(source).not.toMatch(/from "posthog-js"/);
  });

  it("only mounts the client when the key is configured", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toMatch(/posthogKey \? <PostHogAnalytics apiKey=\{posthogKey\} \/> : null/);
  });
});

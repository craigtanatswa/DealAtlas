// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildPostHogClientConfig } from "@/lib/analytics/config";
import {
  clearPostHogStorage,
  resetAnalyticsConsentForTests,
  setAnalyticsConsent,
} from "@/lib/analytics/consent";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

const KEY = "phc_sessioncontinuitytest1234567890";
const ORIGIN = "https://www.dealatlas.uk";

function postHogKeys(): string[] {
  return [...Object.keys(window.localStorage), ...Object.keys(window.sessionStorage)].filter(
    (key) => key.startsWith("ph_") || key.startsWith("__ph_opt_in_out_"),
  );
}

async function initFreshPostHog() {
  vi.resetModules();
  const { default: posthog } = await import("posthog-js/dist/module.slim.no-external");
  posthog.init(KEY, buildPostHogClientConfig(ORIGIN));
  return posthog;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetAnalyticsConsentForTests();
  vi.restoreAllMocks();
});

describe("PostHog session continuity", () => {
  it("keeps the anonymous id and session across a reload", async () => {
    const first = await initFreshPostHog();
    const distinctId = first.get_distinct_id();
    const sessionId = first.get_session_id();
    expect(distinctId).toBeTruthy();
    expect(sessionId).toBeTruthy();
    expect(postHogKeys().some((key) => key.startsWith(`ph_${KEY}_`))).toBe(true);
    await first.shutdown();

    const reloaded = await initFreshPostHog();
    expect(reloaded.get_distinct_id()).toBe(distinctId);
    expect(reloaded.get_session_id()).toBe(sessionId);
  });

  it("removes PostHog storage on rejection but leaves unrelated keys", () => {
    window.localStorage.setItem("ph_x_posthog", "{}");
    window.localStorage.setItem("__ph_opt_in_out_x", "1");
    window.localStorage.setItem("theme", "dark");
    window.localStorage.setItem("unrelated", "kept");
    window.sessionStorage.setItem("ph_x_window_id", "w");
    window.sessionStorage.setItem("ph_x_primary_window_exists", "true");
    window.sessionStorage.setItem("tab_state", "kept");

    setAnalyticsConsent(false);

    expect(window.sessionStorage.getItem("ph_x_window_id")).toBeNull();
    expect(window.sessionStorage.getItem("ph_x_primary_window_exists")).toBeNull();
    expect(window.sessionStorage.getItem("tab_state")).toBe("kept");

    expect(window.localStorage.getItem("ph_x_posthog")).toBeNull();
    expect(window.localStorage.getItem("__ph_opt_in_out_x")).toBeNull();
    expect(window.localStorage.getItem("theme")).toBe("dark");
    expect(window.localStorage.getItem("unrelated")).toBe("kept");
  });

  it("writes no PostHog storage when analytics is not consented", async () => {
    const { PostHogAnalytics } = await import("@/components/analytics/posthog-analytics");
    render(createElement(PostHogAnalytics, { apiKey: KEY }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(postHogKeys()).toEqual([]);
  });

  it("clearPostHogStorage never throws when storage is unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(() => clearPostHogStorage()).not.toThrow();
    } finally {
      if (original) {
        Object.defineProperty(window, "localStorage", original);
      }
    }
  });
});

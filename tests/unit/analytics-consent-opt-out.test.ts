import { afterEach, describe, expect, it, vi } from "vitest";

import {
  registerAnalyticsOptOutHandler,
  resetAnalyticsConsentForTests,
  setAnalyticsConsent,
} from "@/lib/analytics/consent";
import { resetLocalStorageForTests } from "@/lib/analytics/storage";

describe("analytics rejection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetLocalStorageForTests();
    resetAnalyticsConsentForTests();
  });

  it("opts PostHog out, denies GA consent and clears _ga/_ga_* cookies", () => {
    const optOut = vi.fn();
    const gtag = vi.fn();
    const cookieWrites: string[] = [];
    const documentStub = {
      get cookie() {
        return "_ga=GA1.1.111; _ga_TEST=GA1.1.222; theme=dark";
      },
      set cookie(value: string) {
        cookieWrites.push(value);
      },
    };
    vi.stubGlobal("window", { posthog: { opt_out_capturing: optOut }, gtag });
    vi.stubGlobal("document", documentStub);

    const registeredOptOut = vi.fn();
    const unregister = registerAnalyticsOptOutHandler(registeredOptOut);

    setAnalyticsConsent(false);

    expect(optOut).toHaveBeenCalledOnce();
    expect(gtag).toHaveBeenCalledWith("consent", "update", {
      analytics_storage: "denied",
    });
    expect(registeredOptOut).toHaveBeenCalledOnce();
    expect(cookieWrites).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^_ga=;.*Max-Age=0/),
        expect.stringMatching(/^_ga_TEST=;.*Max-Age=0/),
      ]),
    );
    expect(cookieWrites.some((value) => value.startsWith("theme="))).toBe(false);

    unregister();
  });
});

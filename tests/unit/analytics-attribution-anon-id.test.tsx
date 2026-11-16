// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  consented: false,
  anonId: null as string | null,
}));

vi.mock("@/hooks/use-analytics-consent", () => ({
  useAnalyticsConsent: () => state.consented,
}));

vi.mock("@/components/analytics/posthog-analytics", () => ({
  getAnalyticsDistinctId: () => state.anonId,
  subscribeToAnalyticsClient: () => () => undefined,
}));

import { AnalyticsAttributionFields } from "@/components/analytics/attribution-fields";
import { ANALYTICS_ANON_ID_FIELD } from "@/lib/analytics/attribution";
import { sanitizeClientEvent } from "@/lib/analytics/sanitize";

const ORIGIN = "https://www.dealatlas.uk";
const ANON = "019a0c1e-1111-7111-8111-111111111111";
const USER = "019a0c1e-9a4d-7c8e-8b1f-2d6e5a7c9b10";

function anonInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>(
    `input[name="${ANALYTICS_ANON_ID_FIELD}"]`,
  );
}

beforeEach(() => {
  state.consented = false;
  state.anonId = null;
});

afterEach(() => {
  cleanup();
});

describe("P5 client anonymous-id join", () => {
  it("S&B client: AnalyticsAttributionFields renders no analytics_anon_id without consent", () => {
    state.anonId = ANON;

    const { container } = render(<AnalyticsAttributionFields enabled />);

    expect(anonInput(container)).toBeNull();
  });

  it("S&B client: AnalyticsAttributionFields renders no analytics_anon_id before PostHog has loaded", () => {
    state.consented = true;

    const { container } = render(<AnalyticsAttributionFields enabled />);

    expect(anonInput(container)).toBeNull();
  });

  it("S&B client: AnalyticsAttributionFields carries the loaded PostHog distinct id with consent", () => {
    state.consented = true;
    state.anonId = ANON;

    const { container } = render(<AnalyticsAttributionFields enabled />);

    expect(anonInput(container)?.value).toBe(ANON);
  });

  it("S&B client: the client sanitizer drops a client-sent $identify", () => {
    const result = sanitizeClientEvent(
      {
        event: "$identify",
        properties: {
          token: "phc_TestKey0123456789abcdef",
          distinct_id: ANON,
          $anon_distinct_id: USER,
          $current_url: `${ORIGIN}/pricing`,
        },
      },
      { origin: ORIGIN },
    );

    expect(result).toBeNull();
  });
});

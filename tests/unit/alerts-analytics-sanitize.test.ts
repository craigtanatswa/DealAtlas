import { describe, expect, it } from "vitest";

import { sanitizeClientEvent } from "@/lib/analytics/sanitize";

const ORIGIN = "https://www.dealatlas.uk";
const TOKEN = "phc_TestKey0123456789abcdef";
const DISTINCT = "019a0c1e-9a4d-7c8e-8b1f-2d6e5a7c9b10";
const SLUG = "council-it-support-canary-a1b2c3";

function sdkEvent(
  overrides: Record<string, unknown> = {},
  event = "alerts_signup_viewed",
) {
  return {
    event,
    properties: {
      token: TOKEN,
      distinct_id: DISTINCT,
      $current_url: `${ORIGIN}/deals/${SLUG}`,
      category_slug: "technology",
      email: "buyer@canary.example",
      buyer: "CANARY BUYER NEVER FREE",
      dealSlug: SLUG,
      ...overrides,
    },
  };
}

describe("alerts signup analytics allowlist", () => {
  it("keeps only the category for viewed and submitted events", () => {
    for (const event of [
      "alerts_signup_viewed",
      "alerts_signup_submitted",
    ] as const) {
      const result = sanitizeClientEvent(
        sdkEvent({ outcome: "pending" }, event),
        { origin: ORIGIN },
      );
      expect(result).not.toBeNull();
      expect(result!.properties.category_slug).toBe("technology");
      expect(result!.properties.outcome).toBeUndefined();
      expect(result!.properties.email).toBeUndefined();
      expect(result!.properties.buyer).toBeUndefined();
      expect(result!.properties.dealSlug).toBeUndefined();
      const serialised = JSON.stringify(result);
      expect(serialised).not.toContain("buyer@canary.example");
      expect(serialised).not.toContain("CANARY BUYER");
      expect(serialised).not.toContain(SLUG);
    }
  });

  it("keeps category and outcome for result events", () => {
    const result = sanitizeClientEvent(
      sdkEvent({ outcome: "rate_limited" }, "alerts_signup_result"),
      { origin: ORIGIN },
    );
    expect(result).not.toBeNull();
    expect(result!.properties.category_slug).toBe("technology");
    expect(result!.properties.outcome).toBe("rate_limited");
    expect(result!.properties.email).toBeUndefined();
    expect(result!.properties.buyer).toBeUndefined();
    expect(result!.properties.dealSlug).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(SLUG);
  });

  it("rejects unknown categories, outcomes and non-deal pages", () => {
    expect(
      sanitizeClientEvent(
        sdkEvent({ category_slug: "not-a-category" }),
        { origin: ORIGIN },
      ),
    ).toBeNull();
    expect(
      sanitizeClientEvent(
        sdkEvent({ outcome: "error" }, "alerts_signup_result"),
        { origin: ORIGIN },
      ),
    ).toBeNull();
    expect(
      sanitizeClientEvent(
        sdkEvent({ $current_url: `${ORIGIN}/pricing` }),
        { origin: ORIGIN },
      ),
    ).toBeNull();
    expect(
      sanitizeClientEvent(
        sdkEvent({ $current_url: `${ORIGIN}/deals` }),
        { origin: ORIGIN },
      ),
    ).toBeNull();
    expect(
      sanitizeClientEvent(
        sdkEvent({ category_slug: undefined }),
        { origin: ORIGIN },
      ),
    ).toBeNull();
    expect(
      sanitizeClientEvent(
        sdkEvent({ outcome: undefined }, "alerts_signup_result"),
        { origin: ORIGIN },
      ),
    ).toBeNull();
  });
});

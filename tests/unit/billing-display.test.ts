import { describe, expect, it } from "vitest";

import { planLabel, priceLabel } from "@/lib/billing/display";

describe("plan labels", () => {
  it("names a lifetime purchase Pro Lifetime deal, not a founding annual plan", () => {
    expect(planLabel("founding_lifetime", null, true, "lifetime")).toBe(
      "Pro Lifetime deal",
    );
    expect(planLabel("founding_lifetime", null, true)).toBe("Pro Lifetime deal");
    expect(planLabel("PRO_ANNUAL", "ANNUAL", true)).toBe("Pro annual");
  });

  it("keeps the standard labels for everyone else", () => {
    expect(planLabel("PRO_ANNUAL", "ANNUAL", false)).toBe("Pro annual");
    expect(planLabel("PRO_ANNUAL", "ANNUAL")).toBe("Pro annual");
    expect(planLabel("PRO_MONTHLY", "MONTHLY", true)).toBe("Pro monthly");
    expect(planLabel(null, null, true)).toBe("Free");
  });

  it("uses the one-time lifetime price", () => {
    expect(priceLabel("founding_lifetime")).toBe("£250 one-time");
    expect(priceLabel("PRO_ANNUAL")).toBe("£350/year");
    expect(priceLabel("PRO_MONTHLY")).toBe("£39/month");
  });
});

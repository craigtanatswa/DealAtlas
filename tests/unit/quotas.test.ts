import { describe, expect, it } from "vitest";

import {
  featureLimit,
  isAtFeatureLimit,
  mapQuotaError,
  QUOTA_ERROR_COPY,
  quotaLabel,
  remainingQuota,
} from "@/lib/quotas";
import { FEATURE_LIMITS, PLANS, UNLIMITED } from "@/lib/constants";

describe("feature quotas", () => {
  it("matches documented free and Pro saved limits", () => {
    expect(featureLimit(PLANS.FREE, "savedDeals")).toBe(5);
    expect(featureLimit(PLANS.FREE, "savedSearches")).toBe(1);
    expect(featureLimit(PLANS.PRO, "savedDeals")).toBe(UNLIMITED);
    expect(featureLimit(PLANS.PRO, "savedSearches")).toBe(50);
    expect(FEATURE_LIMITS.FREE.savedDeals).toBe(5);
    expect(FEATURE_LIMITS.PRO.savedSearches).toBe(50);
  });

  it("treats the fifth free saved deal as the last allowed slot", () => {
    expect(isAtFeatureLimit(5, 5)).toBe(true);
    expect(isAtFeatureLimit(4, 5)).toBe(false);
    expect(remainingQuota(4, 5)).toBe(1);
    expect(isAtFeatureLimit(12, UNLIMITED)).toBe(false);
    expect(quotaLabel(2, 5)).toBe("2 of 5 saved");
    expect(quotaLabel(3, UNLIMITED)).toBe("3 saved");
  });

  it("maps database trigger messages to the same UX copy", () => {
    expect(mapQuotaError("saved deal limit reached")).toBe("savedDeals");
    expect(mapQuotaError("saved search limit reached")).toBe("savedSearches");
    expect(QUOTA_ERROR_COPY.savedDeals).toContain("5 opportunities");
    expect(QUOTA_ERROR_COPY.savedSearches).toContain("up to 50");
  });
});

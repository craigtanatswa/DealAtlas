import { describe, expect, it } from "vitest";

import {
  FEATURE_LIMITS,
  PLANS,
  ROLES,
  UNLIMITED,
} from "@/lib/constants";

describe("application constants", () => {
  it("encodes documented free and Pro feature limits", () => {
    expect(FEATURE_LIMITS.FREE.savedDeals).toBe(5);
    expect(FEATURE_LIMITS.FREE.savedSearches).toBe(1);
    expect(FEATURE_LIMITS.PRO.savedDeals).toBe(UNLIMITED);
    expect(FEATURE_LIMITS.PRO.savedSearches).toBe(50);
    expect(FEATURE_LIMITS.PRO.exportRowsPerMonth).toBe(1000);
    expect(FEATURE_LIMITS.PRO.watchedBuyers).toBe(50);
    expect(FEATURE_LIMITS.PRO.watchedSuppliers).toBe(50);
  });

  it("keeps role and plan identifiers stable", () => {
    expect(ROLES.USER).toBe("USER");
    expect(ROLES.ADMIN).toBe("ADMIN");
    expect(PLANS.FREE).toBe("FREE");
    expect(PLANS.PRO).toBe("PRO");
  });
});

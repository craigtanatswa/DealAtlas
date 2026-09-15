import { describe, expect, it } from "vitest";

import {
  ACCOUNT_NAV,
  ADMIN_NAV,
  APP_NAV,
  AUTH_NAV,
  FEATURE_LIMITS,
  FOOTER_NAV,
  PLANS,
  PUBLIC_NAV,
  ROLES,
  UNLIMITED,
} from "@/lib/constants";

describe("application constants", () => {
  it("encodes documented free and Pro feature limits", () => {
    expect(FEATURE_LIMITS.FREE.savedDeals).toBe(5);
    expect(FEATURE_LIMITS.FREE.savedSearches).toBe(1);
    expect(FEATURE_LIMITS.PRO.savedDeals).toBe(UNLIMITED);
    expect(FEATURE_LIMITS.PRO.savedSearches).toBe(50);
    expect(FEATURE_LIMITS.FREE.exportRowsPerMonth).toBe(0);
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

  it("matches the documented public, app, and admin navigation", () => {
    expect(PUBLIC_NAV.map((item) => item.label)).toEqual([
      "Find Deals",
      "How It Works",
      "Pricing",
    ]);
    expect(AUTH_NAV.map((item) => item.label)).toEqual([
      "Sign In",
      "Get Started",
    ]);
    expect(APP_NAV.map((item) => item.label)).toEqual([
      "Discover",
      "Saved",
      "Searches",
      "Alerts",
      "Buyers",
      "Suppliers",
      "Contracts",
      "Renewals",
    ]);
    expect(APP_NAV.filter((item) => "pro" in item && item.pro).map((item) => item.label)).toEqual([
      "Buyers",
      "Suppliers",
      "Contracts",
      "Renewals",
    ]);
    expect(ACCOUNT_NAV.map((item) => item.label)).toEqual([
      "Account",
      "Billing",
      "Settings",
    ]);
    expect(ADMIN_NAV.map((item) => item.href)).toContain("/admin/ingestion");
    expect(FOOTER_NAV.map((item) => item.href)).toEqual(
      expect.arrayContaining([
        "/categories",
        "/privacy",
        "/terms",
        "/cookies",
        "/contact",
      ]),
    );
  });
});

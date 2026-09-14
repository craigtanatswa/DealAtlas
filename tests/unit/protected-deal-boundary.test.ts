import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("protected deal boundary", () => {
  it("loads entitlement from the subscriptions mirror, not query parameters", () => {
    const route = read("app/api/deals/[id]/route.ts");
    const service = read("lib/entitlements/service.ts");
    const access = read("lib/deals/protected-access.ts");

    expect(route).toContain("getAuthUser");
    expect(route).toContain("getCurrentEntitlement");
    expect(route).toContain("loadPaidDealDto");
    expect(route).toContain("fulfillProtectedDealRequest");
    expect(route).not.toMatch(/searchParams\.get\(\s*["']plan["']/);
    expect(route).not.toMatch(/success=true/);
    expect(route).not.toMatch(/grantPro|forcePro|bypass/i);

    expect(service).toMatch(/import ["']server-only["']/);
    expect(service).toContain("loadCurrentSubscription");
    expect(service).not.toContain("searchParams");

    expect(access).toContain("void input.clientClaimedPlan");
    expect(access).toContain("isProEntitlement");
  });

  it("queries canonical tables only after a server-only paid loader", () => {
    const loader = read("lib/deals/protected.ts");
    expect(loader).toMatch(/import ["']server-only["']/);
    expect(loader).toContain("getCanonicalDealById");
    expect(loader).toContain("toPaidDealDto");
    expect(loader).toContain("listCanonicalLotsForDeal");
    expect(loader).toContain("listCanonicalRequirementsForDeal");
    expect(loader).toContain("listCanonicalAwardCriteriaForDeal");
    expect(loader).toContain("listCanonicalChangesForDeal");
    expect(loader).not.toMatch(/select\(\s*["']\*["']\s*\)/);
  });

  it("reveals protected source data on the app deal page only after a server entitlement check", () => {
    const page = read("app/(app)/app/deals/[id]/page.tsx");
    expect(page).toContain("getCurrentEntitlement");
    expect(page).toContain("isProEntitlement");
    expect(page).toContain("loadPaidDealDto");
    expect(page).toContain("DealPaidDetail");
    expect(page).toContain("getPublicDealPreviewPageByDealId");
    expect(page).not.toMatch(/success=true/);
    expect(page).not.toMatch(/grantPro|forcePro|bypass/i);
  });

  it("mirrors private.is_user_pro status and paid-through rules", () => {
    const sql = read("supabase/migrations/0005_functions_and_indexes.sql");
    const policy = read("lib/entitlements/policy.ts");

    expect(sql).toContain("private.is_user_pro");
    expect(sql).toContain("s.status = 'ACTIVE'");
    expect(sql).toContain("s.status = 'CANCELLED'");
    expect(sql).toContain("s.cancel_at_period_end = true");
    expect(sql).toContain("s.current_period_end > now()");

    expect(policy).toContain('subscription.status === "ACTIVE"');
    expect(policy).toContain('subscription.status === "CANCELLED"');
    expect(policy).toContain("cancelAtPeriodEnd");
    expect(policy).toContain("ON_HOLD");
  });

  it("does not grant subscriptions table access to client roles", () => {
    const grants = read("supabase/migrations/0004_security_and_rls.sql");
    expect(grants).toContain("subscriptions");
    expect(grants).toMatch(
      /subscriptions, billing_events, export_usage and all canonical/,
    );
    expect(grants).not.toMatch(
      /grant (select|insert|update|delete) on table public\.subscriptions to (anon|authenticated)/i,
    );
  });
});

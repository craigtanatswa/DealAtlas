import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("CSV export boundary", () => {
  it("checks Pro entitlement server-side before loading paid export fields", () => {
    const route = read("app/api/exports/route.ts");
    const access = read("lib/exports/access.ts");
    const load = read("lib/exports/load.ts");
    const usage = read("lib/exports/usage.ts");

    expect(route).toContain("getAuthUser");
    expect(route).toContain("getCurrentEntitlement");
    expect(route).toContain("fulfillDealExportRequest");
    expect(route).toContain("loadPaidDealsForExport");
    expect(route).toContain("recordExportUsage");
    expect(route).not.toMatch(/searchParams\.get\(\s*["']plan["']/);
    expect(route).not.toMatch(/success=true/);
    expect(route).not.toMatch(/grantPro|forcePro|bypass/i);

    expect(access).toContain("void input.clientClaimedPlan");
    expect(access).toContain("isProEntitlement");
    expect(access).toContain("remaining <= 0");

    expect(load).toMatch(/import ["']server-only["']/);
    expect(load).toContain("listCanonicalDealRecordsByIds");
    expect(load).toContain("toPaidDealDto");
    expect(load).not.toMatch(/select\(\s*["']\*["']\s*\)/);

    expect(usage).toMatch(/import ["']server-only["']/);
    expect(usage).toContain('.from("export_usage")');
    expect(usage).toContain("row_count");
    expect(usage).not.toMatch(/select\(\s*["']\*["']\s*\)/);
  });

  it("records export_usage through a transactional database trigger", () => {
    const sql = read("supabase/migrations/0015_export_usage_quota.sql");
    expect(sql).toContain("private.enforce_export_usage_limit");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("export row limit reached");
    expect(sql).toContain("1000");
    expect(sql).toContain("private.is_user_pro");
    expect(sql).not.toMatch(
      /grant (select|insert|update|delete) on table public\.export_usage to (anon|authenticated)/i,
    );
  });
});

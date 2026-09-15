import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("protected organisation intelligence boundary", () => {
  it("gates buyer, supplier, contract, and renewal APIs on server entitlement", () => {
    for (const relativePath of [
      "app/api/buyers/route.ts",
      "app/api/buyers/[id]/route.ts",
      "app/api/suppliers/route.ts",
      "app/api/suppliers/[id]/route.ts",
      "app/api/contracts/route.ts",
      "app/api/renewals/route.ts",
    ]) {
      const source = read(relativePath);
      expect(source).toMatch(/intelligence(List|Record)Response/);
      expect(source).not.toMatch(/searchParams\.get\(\s*["']plan["']/);
      expect(source).not.toMatch(/grantPro|forcePro|bypass/i);
    }
  });

  it("does not load organisation identity on free buyer and supplier pages", () => {
    for (const relativePath of [
      "app/(app)/app/buyers/page.tsx",
      "app/(app)/app/buyers/[id]/page.tsx",
      "app/(app)/app/suppliers/page.tsx",
      "app/(app)/app/suppliers/[id]/page.tsx",
      "app/(app)/app/contracts/page.tsx",
      "app/(app)/app/renewals/page.tsx",
    ]) {
      const source = read(relativePath);
      expect(source).toContain("requireProIntelligence");
      expect(source).toContain("IntelligencePaywall");
      expect(source).not.toMatch(/grantPro|forcePro|bypass/i);
    }
  });

  it("keeps canonical intelligence loaders server-only", () => {
    const loader = read("lib/intelligence/load.ts");
    expect(loader).toMatch(/import ["']server-only["']/);
    expect(loader).toContain("loadBuyerIntelligence");
    expect(loader).toContain("loadSupplierIntelligence");
    expect(loader).toContain("listRenewalIntelligence");
    expect(loader).not.toMatch(/select\(\s*["']\*["']\s*\)/);
  });
});

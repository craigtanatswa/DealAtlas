import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Pro annual flag boundary", () => {
  it("the helper is server-only and reads SHOW_ANNUAL, not a public variable", () => {
    const helper = readFileSync("lib/billing/annual-enabled.ts", "utf8");
    expect(helper).toMatch(/^import "server-only";/);
    expect(helper).toContain('SHOW_ANNUAL === "true"');
    expect(helper).toContain("DODO_PRO_ANNUAL_PRODUCT_ID");
  });

  it("no NEXT_PUBLIC_ annual flag exists in app code", () => {
    const hits = execSync(
      "git grep -n -I -e NEXT_PUBLIC_SHOW_ANNUAL -e NEXT_PUBLIC_DODO -- app components lib || true",
      { encoding: "utf8" },
    );
    expect(hits.trim()).toBe("");
  });

  it("the checkout refuses annual before reading Dodo config", () => {
    const source = readFileSync("lib/billing/checkout.ts", "utf8");
    const guard = source.indexOf('parsed.planKey === "PRO_ANNUAL" && !annualEnabled');
    const config = source.indexOf("requireDodoCheckoutConfig()");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(config);
  });
});

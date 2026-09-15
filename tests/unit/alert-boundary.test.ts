import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { savedSearchHref, toSavedSearchFilters } from "@/lib/saves/filters";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("alert and save API boundary", () => {
  it("serves alerts through a server entitlement-safe endpoint", () => {
    const route = read("app/api/alerts/route.ts");
    expect(route).toContain("getCurrentAccount");
    expect(route).toContain("listAlertCentre");
    expect(route).toContain("assertAlertDto");
    expect(route).not.toContain("protected_payload");
    expect(route).not.toMatch(/searchParams\.get\(\s*["']plan["']/);
  });

  it("does not let browser clients query alerts", () => {
    const schema = read("lib/db/public-schema.ts");
    expect(schema).toContain("saved_deals");
    expect(schema).toContain("saved_searches");
    expect(schema).toContain("notification_preferences");
    expect(schema).not.toContain('"alerts"');
  });

  it("runs the alert job as a Node script with the react-server condition", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["send-alerts"]).toContain("allow-server-only.mjs");
    expect(read("scripts/send-alerts.ts")).toContain("evaluateAlerts");
    expect(read("lib/alerts/evaluate.ts")).toContain("getCurrentEntitlement");
    expect(read("lib/alerts/evaluate.ts")).toContain("renderAlertDigest");
  });

  it("updates notification preferences without upserting the primary key", () => {
    const source = read("lib/alerts/actions.ts");
    expect(source).toContain(".update(patch)");
    expect(source).not.toContain(".upsert(");
  });

  it("does not export non-functions from use-server action modules", () => {
    for (const relativePath of [
      "lib/saves/actions.ts",
      "lib/alerts/actions.ts",
      "lib/auth/actions.ts",
    ]) {
      const source = read(relativePath);
      expect(source).toMatch(/^["']use server["']/);
      expect(source).not.toMatch(/^export \{/m);
      expect(source).not.toMatch(/^export const /m);
    }
  });

  it("builds saved-search URLs from sanitised filters", () => {
    const href = savedSearchHref(
      toSavedSearchFilters({
        query: "cloud",
        category: "Technology",
        page: 4,
        limit: 20,
        sort: "relevance",
      }),
    );
    expect(href).toContain("/app/search");
    expect(href).toContain("q=cloud");
    expect(href).toContain("category=Technology");
    expect(href).not.toContain("page=4");
  });
});

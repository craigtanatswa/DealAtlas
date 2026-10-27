import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

const LEGACY_SIGNUP_IMPORT = /from\s+["']@\/lib\/alerts\/signup(["']|\/)/;

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function walk(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(rel);
      return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
    },
  );
}

describe("alerts client boundary", () => {
  it("no component or client module imports the server-only @/lib/alerts/signup", () => {
    const offenders = ["components", "app", "lib", "hooks"]
      .filter((dir) => fs.existsSync(path.join(ROOT, dir)))
      .flatMap(walk)
      .filter((rel) => !rel.startsWith(path.join("lib", "alerts", "signup") + path.sep))
      .filter((rel) => {
        const source = read(rel);
        return (
          (rel.startsWith("components") || /^\s*["']use client["']/.test(source)) &&
          LEGACY_SIGNUP_IMPORT.test(source)
        );
      });
    expect(offenders).toEqual([]);
  });

  it.each([
    "components/alerts/get-alerts-card.tsx",
    "lib/alerts/signup-client.ts",
    "lib/alerts/analytics.ts",
    "components/deals/deal-preview-detail.tsx",
  ])("does not import the legacy signup module from %s", (relativePath) => {
    expect(read(relativePath)).not.toMatch(LEGACY_SIGNUP_IMPORT);
  });

  it("imports the client signup module from the alerts card", () => {
    expect(read("components/alerts/get-alerts-card.tsx")).toContain(
      '"@/lib/alerts/signup-client"',
    );
  });
});

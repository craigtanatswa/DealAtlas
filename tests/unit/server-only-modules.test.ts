import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

const SERVER_ONLY_MODULES = [
  "lib/env/server.ts",
  "lib/supabase/admin.ts",
  "lib/db/canonical.ts",
  "lib/auth/session.ts",
  "lib/auth/profile.ts",
  "lib/search/public.ts",
  "lib/entitlements/service.ts",
  "lib/entitlements/store.ts",
  "lib/deals/protected.ts",
];

const CLIENT_GLOBS = ["components", "app"];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(fullPath);
    }
    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")
      ? [fullPath]
      : [];
  });
}

describe("server-only module boundary", () => {
  it("marks privileged modules with server-only", () => {
    for (const relativePath of SERVER_ONLY_MODULES) {
      const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
      expect(source).toMatch(/import ["']server-only["']/);
    }
  });

  it("does not import privileged modules from client components", () => {
    const files = CLIENT_GLOBS.flatMap((dir) => walk(path.join(ROOT, dir)));
    const clientFiles = files.filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      return source.includes('"use client"') || source.includes("'use client'");
    });

    for (const file of clientFiles) {
      const source = fs.readFileSync(file, "utf8");
      expect(source).not.toMatch(/from ["']@\/lib\/supabase\/admin["']/);
      expect(source).not.toMatch(/from ["']@\/lib\/env\/server["']/);
      expect(source).not.toMatch(/from ["']@\/lib\/db\/canonical["']/);
      expect(source).not.toMatch(/from ["']@\/lib\/auth\/session["']/);
      expect(source).not.toMatch(/from ["']@\/lib\/auth\/profile["']/);
      expect(source).not.toMatch(/from ["']@\/lib\/search\/public["']/);
      expect(source).not.toMatch(/from ["']@\/lib\/entitlements\/service["']/);
      expect(source).not.toMatch(/from ["']@\/lib\/entitlements\/store["']/);
      expect(source).not.toMatch(/from ["']@\/lib\/deals\/protected["']/);
    }
  });
});

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(fullPath);
    }
    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

describe("ingestion module boundary", () => {
  it("does not import ingestion from client components", () => {
    const files = ["components", "app"].flatMap((dir) => walk(path.join(ROOT, dir)));
    const clientFiles = files.filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      return source.includes('"use client"') || source.includes("'use client'");
    });

    for (const file of clientFiles) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from ["']@\/ingestion/);
    }
  });

  it("keeps worker ingestion off the server-only admin client", () => {
    const worker = fs.readFileSync(
      path.join(ROOT, "ingestion/store/worker-client.ts"),
      "utf8",
    );
    expect(worker).not.toMatch(/import ["']server-only["']/);
    expect(worker).not.toMatch(/from ["']@\/lib\/supabase\/admin["']/);
  });
});

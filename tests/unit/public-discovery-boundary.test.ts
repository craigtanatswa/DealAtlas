import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

const PUBLIC_DISCOVERY_PATHS = [
  "app/(marketing)/deals",
  "app/api/search",
  "lib/search",
  "lib/db/previews.ts",
  "lib/db/preview-columns.ts",
];

function walk(target: string): string[] {
  const fullPath = path.isAbsolute(target) ? target : path.join(ROOT, target);
  const stats = fs.statSync(fullPath);
  if (stats.isFile()) {
    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
  }

  return fs.readdirSync(fullPath, { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(fullPath, entry.name);
    if (entry.isDirectory()) {
      return walk(next);
    }
    return next.endsWith(".ts") || next.endsWith(".tsx") ? [next] : [];
  });
}

describe("public discovery data boundary", () => {
  const files = PUBLIC_DISCOVERY_PATHS.flatMap(walk);
  const sources = files.map((file) => ({
    file: path.relative(ROOT, file),
    source: fs.readFileSync(file, "utf8"),
  }));

  it("does not query canonical source tables from public/free code", () => {
    for (const { file, source } of sources) {
      expect(source, file).not.toMatch(/from ["']@\/lib\/db\/canonical["']/);
      expect(source, file).not.toMatch(/from ["']@\/lib\/supabase\/admin["']/);
      expect(source, file).not.toMatch(/getCanonicalDealById/);
      expect(source, file).not.toMatch(/\.from\(\s*["']deals["']\s*\)/);
      expect(source, file).not.toMatch(/\.from\(\s*["']organizations["']\s*\)/);
      expect(source, file).not.toMatch(/\.from\(\s*["']notices["']\s*\)/);
      expect(source, file).not.toMatch(/\.from\(\s*["']documents["']\s*\)/);
      expect(source, file).not.toMatch(/\.from\(\s*["']data_sources["']\s*\)/);
      expect(source, file).not.toMatch(/select\(\s*["']\*["']\s*\)/);
    }
  });

  it("loads public payloads from deal_previews or search_deal_previews", () => {
    const combined = sources.map(({ source }) => source).join("\n");
    expect(combined).toContain("deal_previews");
    expect(combined).toContain("search_deal_previews");
    expect(combined).toContain("DEAL_PREVIEW_PUBLIC_SELECT");
  });

  it("does not import paid/canonical helpers from public/free discovery", () => {
    for (const { file, source } of sources) {
      expect(source, file).not.toMatch(/from ["']@\/lib\/deals\/protected["']/);
      expect(source, file).not.toMatch(/from ["']@\/lib\/deals\/paid-dto["']/);
      expect(source, file).not.toMatch(/from ["']@\/lib\/entitlements\/service["']/);
    }
  });

  it("builds metadata from preview helpers only", () => {
    const slugPage = sources.find(({ file }) =>
      file.replaceAll("\\", "/").endsWith("app/(marketing)/deals/[slug]/page.tsx"),
    );
    expect(slugPage).toBeTruthy();
    expect(slugPage?.source).toContain("publicDealPreviewMetadata");
    expect(slugPage?.source).toContain("getPublicDealPreviewBySlug");
    expect(slugPage?.source).not.toContain("source_title");
    expect(slugPage?.source).not.toContain("source_url");
  });
});

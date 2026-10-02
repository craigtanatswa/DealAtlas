import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

const PUBLIC_DISCOVERY_PATHS = [
  "app/(marketing)/deals",
  "app/(marketing)/categories",
  "app/sitemap.ts",
  "app/robots.ts",
  "app/api/search",
  "lib/search",
  "lib/seo",
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

  it("loads public payloads from the preview DTO RPCs only", () => {
    const combined = sources.map(({ source }) => source).join("\n");
    expect(combined).toContain("search_preview_dtos");
    expect(combined).toContain("get_preview_dto_by_slug");
    for (const { file, source } of sources) {
      expect(source, file).not.toMatch(/\.from\(\s*["']deal_previews["']\s*\)/);
      expect(source, file).not.toMatch(/rpc\(\s*["']search_deal_previews/);
    }
  });

  it("only resolves internal deal ids for signed-in viewers", () => {
    const publicSearch = fs.readFileSync(path.join(ROOT, "lib/search/public.ts"), "utf8");
    expect(publicSearch).toMatch(
      /options\.signedIn\s*\?\s*await resolvePublishedPreviewDealId\(/,
    );
    const slugPage = fs.readFileSync(
      path.join(ROOT, "app/(marketing)/deals/[slug]/page.tsx"),
      "utf8",
    );
    expect(slugPage).toContain("signedIn: Boolean(user)");
    expect(slugPage).toContain("const dealId = user ? page.dealId : null;");
  });

  it("does not import paid/canonical helpers from public/free discovery", () => {
    for (const { file, source } of sources) {
      const relative = file.replaceAll("\\", "/");
      expect(source, file).not.toMatch(/from ["']@\/lib\/deals\/protected["']/);
      expect(source, file).not.toMatch(/from ["']@\/lib\/deals\/paid-dto["']/);
      if (!relative.endsWith("app/(marketing)/deals/[slug]/page.tsx")) {
        expect(source, file).not.toMatch(/from ["']@\/lib\/entitlements\/service["']/);
      }
    }
  });

  it("builds metadata from preview helpers only", () => {
    const slugPage = sources.find(({ file }) =>
      file.replaceAll("\\", "/").endsWith("app/(marketing)/deals/[slug]/page.tsx"),
    );
    expect(slugPage).toBeTruthy();
    expect(slugPage?.source).toContain("publicDealPreviewMetadata");
    expect(slugPage?.source).toContain("getPublicDealPreviewPageBySlug");
    expect(slugPage?.source).not.toContain("source_title");
    expect(slugPage?.source).not.toContain("source_url");
    expect(slugPage?.source).not.toContain("loadPaidDealDto");
  });
});

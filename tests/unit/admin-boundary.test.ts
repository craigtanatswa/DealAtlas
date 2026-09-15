import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(relative);
    }
    return relative.endsWith(".ts") || relative.endsWith(".tsx")
      ? [path.join(ROOT, relative)]
      : [];
  });
}

describe("admin console boundary", () => {
  it("requires ADMIN on the admin layout, loaders, and every mutation action", () => {
    expect(read("app/(admin)/admin/layout.tsx")).toContain("requireAdmin");
    expect(read("lib/admin/page.ts")).toContain("requireAdmin");
    const actions = read("lib/admin/actions.ts");
    expect(actions).toContain('"use server"');
    expect(actions).toContain("requireAdminAction");
    expect(actions).not.toMatch(/import ["']server-only["']/);
    for (const name of [
      "setSourceEnabledAction",
      "holdPreviewUnpublishedAction",
      "regeneratePreviewAction",
      "mergeOrganizationsAction",
      "runSourceIngestionAction",
      "reprocessRawRecordAction",
    ]) {
      expect(actions).toContain(name);
    }
  });

  it("does not expose a public admin mutation API", () => {
    const apiRoot = path.join(ROOT, "app", "api");
    const apiFiles = fs.existsSync(apiRoot) ? walk("app/api") : [];
    for (const file of apiFiles) {
      const relative = path.relative(ROOT, file).replaceAll("\\", "/");
      expect(relative).not.toMatch(/app\/api\/admin\b/);
      expect(read(relative)).not.toMatch(/from ["']@\/lib\/admin\/mutations["']/);
    }
  });

  it("does not ship the Supabase secret key to browser code", () => {
    const files = ["components", "app"].flatMap((dir) => walk(dir));
    const clientFiles = files.filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      return source.includes('"use client"') || source.includes("'use client'");
    });
    for (const file of clientFiles) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from ["']@\/lib\/supabase\/admin["']/);
      expect(source, file).not.toMatch(/from ["']@\/lib\/env\/server["']/);
      expect(source, file).not.toMatch(/SUPABASE_SECRET_KEY/);
      expect(source, file).not.toMatch(/from ["']@\/lib\/admin\/load["']/);
      expect(source, file).not.toMatch(/from ["']@\/lib\/admin\/mutations["']/);
    }
  });

  it("keeps admin loaders server-only with explicit columns", () => {
    const load = read("lib/admin/load.ts");
    expect(load).toMatch(/import ["']server-only["']/);
    expect(load).toContain("unpublished_by_admin");
    expect(load).toContain("preview_generation_runs");
    expect(load).toContain("ingestion_errors");
    expect(load).not.toMatch(/select\(\s*["']\*["']\s*\)/);
    expect(read("lib/admin/mutations.ts")).toMatch(/import ["']server-only["']/);
    expect(read("lib/admin/audit.ts")).toContain("admin_audit_events");
  });
});

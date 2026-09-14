import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

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

describe("auth source guards", () => {
  it("protects /app and /admin on the server", () => {
    expect(read("app/(app)/app/layout.tsx")).toContain("requireUser");
    expect(read("app/(admin)/admin/layout.tsx")).toContain("requireAdmin");
    expect(read("lib/auth/session.ts")).toContain("forbidden()");
    expect(read("lib/auth/session.ts")).toContain("isAdminRole(account.profile.role)");
    expect(read("proxy.ts")).toContain("updateSession");
  });

  it("does not expose a self-promotion endpoint", () => {
    const files = ["app", "lib/auth", "lib/supabase"].flatMap((dir) =>
      walk(path.join(ROOT, dir)),
    );
    files.push(path.join(ROOT, "proxy.ts"));
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, path.relative(ROOT, file)).not.toMatch(
        /promoteToAdmin|makeAdmin|setRole\(/i,
      );
      expect(source, path.relative(ROOT, file)).not.toMatch(
        /role:\s*["']ADMIN["']/,
      );
      expect(source, path.relative(ROOT, file)).not.toMatch(
        /\.update\(\s*\{[^}]*\brole\s*:/,
      );
    }
  });

  it("hardcodes USER on profile recovery inserts", () => {
    const recovery = read("lib/auth/profile.ts");
    expect(recovery).toContain("recoverMissingProfile");
    expect(recovery).toContain("profileInsertFromAuthUser");
    expect(recovery).toContain("role: ROLES.USER");
    expect(recovery).not.toContain("user_metadata.role");
    expect(recovery).not.toContain("app_metadata");
  });

  it("sanitizes auth callback next paths", () => {
    const callback = read("app/auth/callback/route.ts");
    expect(callback).toContain("sanitizeRedirectPath");
    expect(callback).toContain("exchangeCodeForSession");
    expect(callback).toContain("verifyOtp");
  });
});

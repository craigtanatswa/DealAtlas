import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { productionAuthRedirectUrls } from "@/lib/auth/urls";

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
    expect(read("proxy.ts")).toContain("shouldHideDesignSystem");
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
    expect(callback).toContain("OAUTH_NEXT_COOKIE");
  });

  it("starts Google OAuth on the server and keeps the client secret out of Next.js", () => {
    const actions = read("lib/auth/actions.ts");
    expect(actions).toContain("signInWithGoogleAction");
    expect(actions).toContain('provider: "google"');
    expect(actions).toContain("signInWithOAuth");
    expect(actions).toContain("authCallbackUrlForRequest");
    expect(actions).toContain('sameSite: "lax"');
    expect(read("components/auth/login-form.tsx")).toContain("GoogleSignInButton");
    expect(read("components/auth/signup-form.tsx")).toContain("GoogleSignInButton");
    expect(read("supabase/config.toml")).toContain("[auth.external.google]");
    expect(read("supabase/config.toml")).toContain(
      'secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"',
    );
    expect(read("lib/env/public-schema.ts")).toContain("NEXT_PUBLIC_GOOGLE_CLIENT_ID");
    expect(read("lib/env/public-schema.ts")).not.toContain("GOOGLE_CLIENT_SECRET");
    expect(read("lib/env/server-schema.ts")).not.toContain("GOOGLE_CLIENT");
  });

  it("sends password reset links to the callback with next=/reset-password", () => {
    expect(read("lib/auth/actions.ts")).toContain("authResetCallbackUrl");
    expect(read("lib/auth/urls.ts")).toContain("?next=${RESET_PASSWORD_PATH}");
    const callback = read("app/auth/callback/route.ts");
    expect(callback).toContain("honorReset");
    expect(callback).toContain('type === "recovery"');
    expect(callback).toContain("signupFlow");
  });

  it("lists production auth redirect URLs from the public origin", () => {
    expect(productionAuthRedirectUrls("https://app.example")).toEqual([
      "https://app.example/auth/callback",
      "https://app.example/auth/callback?next=/app",
      "https://app.example/auth/callback?next=/reset-password",
      "https://app.example/auth/confirm",
    ]);
  });
});

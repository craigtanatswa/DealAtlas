import { describe, expect, it } from "vitest";

import {
  AUTH_HOME_PATH,
  LOGIN_PATH,
  resolveProtectedRouteRedirect,
  sanitizeRedirectPath,
} from "@/lib/auth/redirect";

describe("auth redirect sanitization", () => {
  it("allows safe internal paths", () => {
    expect(sanitizeRedirectPath("/app")).toBe("/app");
    expect(sanitizeRedirectPath("/app/profile")).toBe("/app/profile");
    expect(sanitizeRedirectPath("/app/search?q=cloud")).toBe("/app/search?q=cloud");
  });

  it("rejects open redirects", () => {
    expect(sanitizeRedirectPath("https://evil.example")).toBe(AUTH_HOME_PATH);
    expect(sanitizeRedirectPath("//evil.example")).toBe(AUTH_HOME_PATH);
    expect(sanitizeRedirectPath("/\\evil.example")).toBe(AUTH_HOME_PATH);
    expect(sanitizeRedirectPath("///evil.example")).toBe(AUTH_HOME_PATH);
    expect(sanitizeRedirectPath("/%2F%2Fevil.example")).toBe(AUTH_HOME_PATH);
    expect(sanitizeRedirectPath("/%252F%252Fevil.example")).toBe(AUTH_HOME_PATH);
    expect(sanitizeRedirectPath("javascript:alert(1)")).toBe(AUTH_HOME_PATH);
    expect(sanitizeRedirectPath("/app@evil.example")).toBe(AUTH_HOME_PATH);
    expect(sanitizeRedirectPath("/auth/callback")).toBe(AUTH_HOME_PATH);
    expect(sanitizeRedirectPath("/login")).toBe(AUTH_HOME_PATH);
  });

  it("redirects anonymous users away from /app and /admin", () => {
    expect(resolveProtectedRouteRedirect("/app", false)).toBe(
      `${LOGIN_PATH}?next=${encodeURIComponent("/app")}`,
    );
    expect(resolveProtectedRouteRedirect("/app/profile", false)).toBe(
      `${LOGIN_PATH}?next=${encodeURIComponent("/app/profile")}`,
    );
    expect(resolveProtectedRouteRedirect("/admin", false)).toBe(
      `${LOGIN_PATH}?next=${encodeURIComponent("/admin")}`,
    );
    expect(resolveProtectedRouteRedirect("/deals", false)).toBeNull();
  });

  it("sends authenticated users away from login/signup", () => {
    expect(resolveProtectedRouteRedirect("/login", true, "/app/profile")).toBe(
      "/app/profile",
    );
    expect(resolveProtectedRouteRedirect("/signup", true, "https://evil.example")).toBe(
      AUTH_HOME_PATH,
    );
    expect(resolveProtectedRouteRedirect("/reset-password", true)).toBeNull();
    expect(resolveProtectedRouteRedirect("/auth/callback", false)).toBeNull();
  });
});

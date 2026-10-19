import { describe, expect, it } from "vitest";

import { resolveNextPath } from "@/lib/auth/redirect";

describe("resolveNextPath", () => {
  it("keeps the normal home path when no value is supplied", () => {
    expect(resolveNextPath(undefined)).toBe("/app");
    expect(resolveNextPath("")).toBe("/app");
  });

  it("allows safe internal deal paths", () => {
    expect(resolveNextPath("/deals/some-slug")).toBe("/deals/some-slug");
  });

  it("falls back to /deals for unsafe supplied values", () => {
    expect(resolveNextPath("//evil.com")).toBe("/deals");
    expect(resolveNextPath("https://evil.com")).toBe("/deals");
    expect(resolveNextPath("/\\evil")).toBe("/deals");
    expect(resolveNextPath("%2F%2Fevil.com")).toBe("/deals");
    expect(resolveNextPath("javascript:alert(1)")).toBe("/deals");
    expect(resolveNextPath("/login")).toBe("/deals");
  });

  it("uses a custom missing fallback", () => {
    expect(resolveNextPath(undefined, "/custom")).toBe("/custom");
    expect(resolveNextPath("", "/custom")).toBe("/custom");
  });
});

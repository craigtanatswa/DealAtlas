import { describe, expect, it } from "vitest";

import { safeHttpUrl } from "@/lib/deals/urls";

describe("safeHttpUrl", () => {
  it("allows http and https URLs", () => {
    expect(safeHttpUrl("https://canary-source.example/notice")).toBe(
      "https://canary-source.example/notice",
    );
    expect(safeHttpUrl("http://localhost:3000/apply")).toBe(
      "http://localhost:3000/apply",
    );
  });

  it("rejects non-web and credentialed URLs", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,hi")).toBeNull();
    expect(safeHttpUrl("//evil.example/path")).toBeNull();
    expect(safeHttpUrl("ftp://files.example/doc")).toBeNull();
    expect(safeHttpUrl("https://user:pass@example.com/secret")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
  });
});

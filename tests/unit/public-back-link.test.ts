import { describe, expect, it } from "vitest";

import { publicBackFallback } from "@/components/navigation/public-back-link";

describe("public back fallback", () => {
  it("sends a deal detail page to the deals list", () => {
    expect(publicBackFallback("/deals/goods-public-tender")).toBe("/deals");
    expect(publicBackFallback("/deals/goods-public-tender/")).toBe("/deals");
  });

  it("sends every other public sub page home", () => {
    expect(publicBackFallback("/deals")).toBe("/");
    expect(publicBackFallback("/pricing")).toBe("/");
    expect(publicBackFallback("/login")).toBe("/");
    expect(publicBackFallback("/signup")).toBe("/");
    expect(publicBackFallback("/categories/construction")).toBe("/");
  });
});

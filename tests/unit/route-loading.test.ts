import { describe, expect, it } from "vitest";

import { isInternalPathChange } from "@/components/feedback/route-loading";

const here = "https://dealatlas.uk/guides";

describe("isInternalPathChange", () => {
  it("accepts same-origin path or query changes", () => {
    expect(isInternalPathChange("https://dealatlas.uk/deals", here)).toBe(true);
    expect(isInternalPathChange("/deals?q=cloud", here)).toBe(true);
    expect(isInternalPathChange("https://dealatlas.uk/guides?page=2", here)).toBe(
      true,
    );
  });

  it("ignores hash-only, external, and non-http links", () => {
    expect(isInternalPathChange("https://dealatlas.uk/guides#main", here)).toBe(
      false,
    );
    expect(isInternalPathChange("https://example.com/deals", here)).toBe(false);
    expect(isInternalPathChange("mailto:hello@dealatlas.uk", here)).toBe(false);
  });
});

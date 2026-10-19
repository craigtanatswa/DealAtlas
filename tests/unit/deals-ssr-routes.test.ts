import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("crawlable deal routes", () => {
  it("have no route-level loading fallback, so the first HTML has real content", () => {
    for (const route of ["app/(marketing)/deals/loading.tsx", "app/(marketing)/deals/[slug]/loading.tsx"]) {
      expect(existsSync(path.resolve(process.cwd(), route)), route).toBe(false);
    }
  });
});

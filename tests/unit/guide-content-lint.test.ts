import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildContext, formatFailure, guideFiles, lintGuideDir } from "@/scripts/guide-lint/lint";

const ROOT = path.resolve(__dirname, "../..");
const GUIDES_DIR = path.join(ROOT, "content", "guides");

describe("guide content lint on content/guides", () => {
  it("finds the guides", () => {
    expect(guideFiles(GUIDES_DIR).length).toBeGreaterThan(0);
  });

  it("has no violations", () => {
    const ctx = buildContext({ guidesDir: GUIDES_DIR, appDir: path.join(ROOT, "app") });
    const report = lintGuideDir(GUIDES_DIR, ctx)
      .map((failure) => formatFailure(failure, ROOT))
      .join("\n");
    expect(report, `Guide content lint violations:\n${report}`).toBe("");
  });
});

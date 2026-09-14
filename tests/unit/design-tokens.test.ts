import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LAYOUT, PALETTE, SEMANTIC_COLOR_TOKENS } from "@/lib/design/tokens";

const ROOT = path.resolve(__dirname, "../..");

describe("design tokens", () => {
  it("encodes the documented DealAtlas palette", () => {
    expect(PALETTE.navy).toBe("#0B1F33");
    expect(PALETTE.atlasBlue).toBe("#2563EB");
    expect(PALETTE.teal).toBe("#0F9F8F");
    expect(PALETTE.amber).toBe("#D99000");
    expect(PALETTE.red).toBe("#C73A3A");
    expect(LAYOUT.contentMaxWidthPx).toBe(1280);
    expect(LAYOUT.spacingGridPx).toBe(8);
  });

  it("maps semantic CSS variables in the global stylesheet", () => {
    const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

    for (const token of SEMANTIC_COLOR_TOKENS) {
      expect(css).toContain(token);
    }

    expect(css).toContain("--primary: var(--atlas-blue)");
    expect(css).toContain("--foreground: var(--navy)");
    expect(css).toContain("--muted-foreground: var(--slate-700)");
  });
});

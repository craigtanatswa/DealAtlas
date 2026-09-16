import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DEAL_CARD_FIXTURES, DEAL_PREVIEW_DETAIL_FIXTURE, PROTECTED_FIELD_NAMES } from "@/components/deals/fixtures";
import { EMPTY_STATE_COPY } from "@/components/feedback/empty-state";

const ROOT = path.resolve(__dirname, "../..");
const DEAL_DIR = path.join(ROOT, "components/deals");

const CANARY_MARKERS = [
  "CANARY BUYER NEVER FREE",
  "canary-protected.example",
  "CANARY-REF-987654",
  "CANARY SOURCE TITLE NEVER FREE",
];

describe("design-system anti-bypass guards", () => {
  it("does not blur protected content in deal components", () => {
    const files = fs
      .readdirSync(DEAL_DIR)
      .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));

    for (const file of files) {
      const source = fs.readFileSync(path.join(DEAL_DIR, file), "utf8");
      expect(source).not.toMatch(/filter:\s*blur/);
      expect(source).not.toMatch(/\bblur-(?:sm|md|lg|xl)\b/);
    }

    const locked = fs.readFileSync(path.join(DEAL_DIR, "locked-field.tsx"), "utf8");
    expect(locked).not.toMatch(/\bvalue\s*[?:]/);
  });

  it("keeps fixtures free of protected canary markers and field names", () => {
    const serialized = JSON.stringify({
      cards: DEAL_CARD_FIXTURES,
      detail: DEAL_PREVIEW_DETAIL_FIXTURE,
    });

    for (const marker of CANARY_MARKERS) {
      expect(serialized).not.toContain(marker);
    }

    for (const fixture of Object.values(DEAL_CARD_FIXTURES)) {
      for (const fieldName of PROTECTED_FIELD_NAMES) {
        expect(fieldName in fixture).toBe(false);
      }
    }

    for (const fieldName of PROTECTED_FIELD_NAMES) {
      expect(fieldName in DEAL_PREVIEW_DETAIL_FIXTURE).toBe(false);
    }
  });

  it("does not invent live opportunity counts in empty-state copy", () => {
    const serialized = JSON.stringify(EMPTY_STATE_COPY);
    expect(serialized).not.toMatch(/\d[\d,]+\s+(live|opportunities|deals)/i);
  });

  it("hides dummy stories on Vercel production", () => {
    const page = fs.readFileSync(
      path.join(ROOT, "app/(marketing)/design-system/page.tsx"),
      "utf8",
    );
    expect(page).toContain("isVercelProduction");
    expect(page).toContain("notFound");
  });
});

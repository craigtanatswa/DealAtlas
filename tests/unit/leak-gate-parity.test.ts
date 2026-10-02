import fs from "node:fs";

import { describe, expect, it } from "vitest";

import { scanPreviewLeaks } from "@/lib/redaction/scan";

import {
  LEAK_GATE_PARITY_SQL_PATH,
  leakScanInputForCase,
  loadLeakGateFixture,
  renderLeakGateParitySql,
} from "../helpers/leak-gate-parity";

const fixture = loadLeakGateFixture();

describe("leak gate parity fixtures (TypeScript scanner)", () => {
  for (const testCase of fixture.cases.filter((item) => !item.sqlOnly)) {
    it(`${testCase.id}: ${testCase.description}`, () => {
      const result = scanPreviewLeaks(leakScanInputForCase(fixture, testCase));
      const codes = new Set(result.findings.map((finding) => finding.code));

      expect(result.risk, JSON.stringify(result.findings)).toBe(testCase.expectRisk);
      for (const code of testCase.expectCodes) {
        expect(codes, `${testCase.id} missing ${code}`).toContain(code);
      }
    });
  }

  for (const testCase of fixture.cases.filter((item) => item.sqlOnly && item.tsExpectRisk)) {
    it(`${testCase.id}: TypeScript alone returns ${testCase.tsExpectRisk} (database rule)`, () => {
      const result = scanPreviewLeaks(leakScanInputForCase(fixture, testCase));
      expect(result.risk, JSON.stringify(result.findings)).toBe(testCase.tsExpectRisk);
    });
  }

  it("keeps synthetic fixtures covering every brief pattern", () => {
    const ids = new Set(fixture.cases.map((item) => item.id));
    for (const id of [
      "clean",
      "buyer-name",
      "buyer-acronym",
      "buyer-slug",
      "supplier-name",
      "unlinked-org",
      "org-suffix",
      "reference",
      "ocid",
      "date-exact-source",
      "date-plus-one",
      "date-unrelated",
      "postcode-full",
      "postcode-outward",
      "location-exact",
      "programme-acronym",
      "title-case-site",
      "short-title-copy",
      "phrase-overlap",
      "combination",
      "date-yearless-may",
      "date-may-modal",
      "date-numeric-source",
      "date-numeric-unrelated",
      "date-hyphenated",
      "buyer-alias-mixed-case",
      "buyer-alias-slug",
      "short-unlinked-org",
      "slug-acronym",
      "slug-site",
      "lowercase-site",
      "lowercase-acronym",
      "slug-postcode",
      "combination-slug",
      "date-yearless-dot",
      "date-yearless-hyphen",
      "date-yearless-space",
      "date-yearless-decimal",
      "location-token-slug",
      "location-token-word",
      "location-token-lowercase",
      "location-token-buyer-city",
      "initial-site-slug",
      "initial-site-word",
      "initial-site-lowercase",
      "heading-site-slug",
      "heading-site-word",
      "heading-site-lowercase",
      "title-site-slug",
      "title-site-word",
      "title-site-lowercase",
      "common-title-word",
      "common-heading-word",
    ]) {
      expect(ids, id).toContain(id);
    }
  });
});

describe("leak gate parity fixtures (generated SQL)", () => {
  it("keeps supabase/tests/database/leak_gate_parity.test.sql in sync", () => {
    expect(fs.readFileSync(LEAK_GATE_PARITY_SQL_PATH, "utf8")).toBe(renderLeakGateParitySql());
  });
});

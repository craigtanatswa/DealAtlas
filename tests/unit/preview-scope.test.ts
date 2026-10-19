import { describe, expect, it } from "vitest";

import { DURATION_BANDS, VALUE_BANDS } from "@/lib/preview/bands";
import { CPV_DIVISION_TITLES } from "@/lib/preview/cpv-label";
import { isFreeTextRisky } from "@/lib/preview/risk";
import { templatedScope, termPhrase, type ScopeInput } from "@/lib/preview/scope";

const BASE: ScopeInput = {
  goods: ["Medical equipment, pharmaceuticals and personal care"],
  standards: ["ISO 9001 quality management"],
  quantityUnits: ["devices"],
  region: "North West England",
  durationBand: "3–5 years",
  valueBand: "£1m–£5m",
  sectorNoun: "healthcare organisation",
  smeSuitable: true,
};

function sentences(text: string): number {
  return (text.match(/[.!?](\s|$)/g) ?? []).length;
}

describe("templatedScope", () => {
  it("builds a 1–2 sentence plain-English scope from structured fields", () => {
    const scope = templatedScope(BASE)!;
    expect(scope).toBe(
      "Covers medical equipment, pharmaceuticals and personal care for a healthcare organisation, delivered within North West England. " +
        "Expect a 3–5 year term, an estimated value of £1m–£5m, standards including ISO 9001 quality management and quantities specified in devices; marked suitable for SMEs.",
    );
    expect(sentences(scope)).toBe(2);
    expect(isFreeTextRisky(scope)).toBe(false);
  });

  it("reads UK-wide for Nationwide and omits undisclosed bands", () => {
    const scope = templatedScope({
      ...BASE,
      region: "Nationwide",
      durationBand: "Not disclosed",
      valueBand: "Undisclosed",
      standards: [],
      quantityUnits: [],
      smeSuitable: null,
    })!;
    expect(scope).toBe(
      "Covers medical equipment, pharmaceuticals and personal care for a healthcare organisation, delivered UK-wide.",
    );
    expect(sentences(scope)).toBe(1);
    expect(scope).not.toMatch(/not disclosed|undisclosed|unknown/i);
  });

  it("keeps acronyms and uses 'an' before vowels", () => {
    const scope = templatedScope({
      ...BASE,
      goods: ["IT services: consulting, software development, Internet and support"],
      sectorNoun: "education organisation",
      region: null,
      durationBand: null,
      valueBand: null,
      standards: [],
      quantityUnits: [],
      smeSuitable: true,
    })!;
    expect(scope).toBe(
      "Covers IT services: consulting, software development, Internet and support for an education organisation. The opportunity is marked suitable for SMEs.",
    );
  });

  it("returns null without a CPV division title (no raw-text fallback)", () => {
    expect(templatedScope({ ...BASE, goods: [] })).toBeNull();
  });

  it("drops a risky clause instead of shipping it, and fails closed on risky goods", () => {
    const scope = templatedScope({ ...BASE, standards: ["Accredited by WBC council"] })!;
    expect(scope).not.toContain("WBC");
    expect(scope).toContain("estimated value of £1m–£5m");
    expect(templatedScope({ ...BASE, goods: ["Supplies for Westford.gov.uk"] })).toBeNull();
  });

  it("every CPV division, duration and value band combination passes the risk check", () => {
    for (const goods of Object.values(CPV_DIVISION_TITLES)) {
      for (const durationBand of DURATION_BANDS) {
        for (const valueBand of VALUE_BANDS) {
          const scope = templatedScope({ ...BASE, goods: [goods], durationBand, valueBand });
          expect(scope, `${goods} / ${durationBand} / ${valueBand}`).not.toBeNull();
          expect(sentences(scope!)).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it("phrases every duration band", () => {
    expect(termPhrase("Under 3 months")).toBe("a term under 3 months");
    expect(termPhrase("6–12 months")).toBe("a 6–12 month term");
    expect(termPhrase("5+ years")).toBe("a 5+ year term");
    expect(termPhrase("Not disclosed")).toBeNull();
  });
});

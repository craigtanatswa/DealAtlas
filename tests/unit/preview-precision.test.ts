import { describe, expect, it } from "vitest";

import { cpvDivisionLabel, cpvGoodsLabel, stripCpvCodes } from "@/lib/preview/cpv-label";
import * as dates from "@/lib/preview/dates";
import { scanPreviewLeaks, type LeakScanInput } from "@/lib/redaction/scan";

describe("CPV free labels", () => {
  it("returns only the division title, never source text or a leaf", () => {
    expect(cpvGoodsLabel("45215130")).toBe("Construction work");
    expect(cpvGoodsLabel("72000000")).toBe(
      "IT services: consulting, software development, Internet and support",
    );
    expect(cpvDivisionLabel("45233100")).toBe("Construction work");
    expect(stripCpvCodes("45233100-8")).toBeNull();
  });

  it("returns null for an unmapped code instead of source text (P2-2)", () => {
    expect(cpvGoodsLabel("99999999")).toBeNull();
    expect(cpvGoodsLabel(null)).toBeNull();
  });
});

describe("free date precision (P1-1)", () => {
  it("no longer exports a day-count helper", () => {
    expect("deadlineDayLabel" in dates).toBe(false);
  });

  const base: LeakScanInput = {
    previewTitle: "It services for a public organisation in north west england",
    previewSummary: "A public organisation is procuring it services. Estimated value £250k–£500k (GBP).",
    requirementsPreview: [],
    sourceTitle: "Managed IT support for civic offices",
    sourceDescription: "Provision of managed IT support, service desk and endpoint management.",
    ocid: "ocds-h6vhtk-fixture1",
    reference: "REF-FIXTURE-1",
    externalPrimaryId: "000001-2026",
    sourceUrl: "https://www.find-tender.service.gov.uk/Notice/000001-2026",
    applicationUrl: null,
    sourceName: "Find a Tender",
    sourceKey: "find-a-tender",
    buyerName: "Example City Council",
    buyerAliases: [],
    buyerDomain: null,
    buyerEmail: null,
    buyerPhone: null,
    exactValueText: "£250,000",
    valueMinExVat: 250000,
    valueMaxExVat: 250000,
    submissionDeadline: "2026-10-01T12:00:00.000Z",
    sourceDates: ["2026-09-01T09:00:00.000Z"],
    exactLocationText: "Manchester",
  };

  it.each([
    "keyDates: Closes in 21 days",
    "keyDates: Questions close in 7 days",
    "keyDates: closing in 1 day",
  ])("the gate rejects a day count: %s", (line) => {
    const result = scanPreviewLeaks({ ...base, requirementsPreview: [line] });
    expect(result.risk).toBe("HIGH");
    expect(result.findings.some((f) => f.code === "DATE_DAY_COUNT")).toBe(true);
  });

  it("the gate rejects a day count in the summary", () => {
    const result = scanPreviewLeaks({ ...base, previewSummary: `${base.previewSummary} Closes in 21 days.` });
    expect(result.risk).toBe("HIGH");
  });

  it("bands stay LOW", () => {
    const result = scanPreviewLeaks({
      ...base,
      requirementsPreview: ["keyDates: Closing window Within 30 days. Contract term 1–2 years"],
    });
    expect(result.risk).toBe("LOW");
  });
});

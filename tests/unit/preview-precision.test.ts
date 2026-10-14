import { describe, expect, it } from "vitest";

import { cpvDivisionLabel, cpvGoodsLabel, stripCpvCodes } from "@/lib/preview/cpv-label";
import { deadlineDayLabel, monthPrecisionLabel } from "@/lib/preview/dates";
import { scanPreviewLeaks, type LeakScanInput } from "@/lib/redaction/scan";

describe("CPV free labels", () => {
  it("keeps a short description and drops the 8-digit code", () => {
    const label = cpvGoodsLabel("45215130", "CPV 45215130 Construction work for hospital facilities");
    expect(label).toBe("Construction work for hospital facilities");
    expect(label).not.toMatch(/\b\d{8}\b/);
    expect(stripCpvCodes("45233100-8")).toBeNull();
  });

  it("rolls a long leaf description up to the group or division", () => {
    const leaf = "Construction work for highways roads airfields railways bridges and associated civil structures";
    const label = cpvGoodsLabel("45233100", leaf);
    expect(label).toBe("Works for complete or part construction and civil engineering");
    expect(label).not.toMatch(/\b\d{8}\b/);
    expect(cpvDivisionLabel("45233100")).toBe("Construction work");
  });
});

describe("free date precision", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");

  it("states the deadline as a day count and other dates as a month", () => {
    expect(deadlineDayLabel("2026-10-01T12:00:00.000Z", now, "OPEN")).toBe("Closes in 21 days");
    expect(monthPrecisionLabel("2026-09-01T09:00:00.000Z")).toBe("September 2026");
    expect(monthPrecisionLabel("2026-11-02T00:00:00.000Z")).toBe("November 2026");
  });

  it("does not turn that precision into a leak-gate finding", () => {
    const input: LeakScanInput = {
      previewTitle: "It services for a public organisation in north west england",
      previewSummary:
        "A public organisation is procuring it services. Estimated value £250k–£500k (GBP). Closes in 21 days. Published September 2026.",
      requirementsPreview: [
        "keyDates: Closes in 21 days. Published September 2026. Award month November 2026",
        "goodsServices: IT services: consulting, software development, Internet and support",
      ],
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
      sourceDates: ["2026-09-01T09:00:00.000Z", "2026-11-02T00:00:00.000Z"],
      exactLocationText: "Manchester",
    };
    expect(scanPreviewLeaks(input).risk).toBe("LOW");
  });
});

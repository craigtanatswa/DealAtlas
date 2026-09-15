import { describe, expect, it } from "vitest";

import { scanPreviewLeaks, type LeakScanInput } from "@/lib/redaction/scan";

function baseInput(overrides: Partial<LeakScanInput> = {}): LeakScanInput {
  return {
    previewTitle: "Technology public tender for a public organisation",
    previewSummary: "A public organisation is seeking technology capability. Estimated value £250k–£500k.",
    requirementsPreview: ["information-security capability"],
    sourceTitle: "Managed IT support for civic offices",
    sourceDescription: "Provision of managed IT support, service desk and endpoint management.",
    ocid: "ocds-h6vhtk-fixture1",
    reference: "REF-FIXTURE-1",
    externalPrimaryId: "000001-2026",
    noticeIdentifiers: ["000001-2026"],
    sourceUrl: "https://www.find-tender.service.gov.uk/Notice/000001-2026",
    applicationUrl: null,
    sourceName: "Find a Tender",
    sourceKey: "find-a-tender",
    buyerName: "Example City Council",
    buyerAliases: ["Example Council"],
    buyerDomain: "example.gov.uk",
    buyerEmail: "procurement@example.gov.uk",
    buyerPhone: "+441611111111",
    exactValueText: "£250,000",
    valueMinExVat: 250000,
    valueMaxExVat: 250000,
    submissionDeadline: "2026-10-01T12:00:00.000Z",
    exactLocationText: "Manchester",
    ...overrides,
  };
}

describe("deterministic preview leak scanner", () => {
  it("allows a sanitised LOW-risk preview", () => {
    const result = scanPreviewLeaks(baseInput());
    expect(result.risk).toBe("LOW");
    expect(result.findings).toEqual([]);
  });

  it("blocks buyer names, aliases and domains", () => {
    expect(scanPreviewLeaks(baseInput({ previewTitle: "Work for Example City Council" })).risk).toBe("HIGH");
    expect(scanPreviewLeaks(baseInput({ previewSummary: "Issued by Example Council" })).risk).toBe("HIGH");
    expect(scanPreviewLeaks(baseInput({ previewSummary: "See example.gov.uk for details" })).risk).toBe("HIGH");
  });

  it("blocks URLs, emails and identifying phones", () => {
    expect(scanPreviewLeaks(baseInput({ previewSummary: "https://www.find-tender.service.gov.uk/x" })).risk).toBe("HIGH");
    expect(scanPreviewLeaks(baseInput({ previewSummary: "Email procurement@example.gov.uk" })).risk).toBe("HIGH");
    expect(scanPreviewLeaks(baseInput({ previewSummary: "Call +44 161 111 1111" })).risk).toBe("HIGH");
  });

  it("blocks OCIDs, reference IDs and source-platform identifiers", () => {
    expect(scanPreviewLeaks(baseInput({ previewTitle: "ocds-h6vhtk-fixture1 opportunity" })).risk).toBe("HIGH");
    expect(scanPreviewLeaks(baseInput({ previewSummary: "Reference REF-FIXTURE-1" })).risk).toBe("HIGH");
    expect(scanPreviewLeaks(baseInput({ previewSummary: "Notice 000001-2026" })).risk).toBe("HIGH");
    expect(scanPreviewLeaks(baseInput({ previewSummary: "Listed on Find a Tender" })).risk).toBe("HIGH");
  });

  it("flags excessive source title and description similarity", () => {
    const title = scanPreviewLeaks(
      baseInput({ previewTitle: "Managed IT support for civic offices" }),
    );
    expect(title.risk).not.toBe("LOW");
    expect(title.findings.some((item) => item.code === "TITLE_SIMILARITY")).toBe(true);

    const description = scanPreviewLeaks(
      baseInput({
        previewSummary: "Provision of managed IT support, service desk and endpoint management.",
      }),
    );
    expect(description.risk).not.toBe("LOW");
    expect(description.findings.some((item) => item.code === "DESCRIPTION_SIMILARITY")).toBe(true);
  });

  it("blocks exact rare amount, deadline and location fingerprints", () => {
    const result = scanPreviewLeaks(
      baseInput({
        previewSummary:
          "Worth exactly £250,000, closing 1 October 2026, delivered in Manchester.",
      }),
    );
    expect(result.risk).toBe("HIGH");
    expect(result.findings.some((item) => item.code === "FINGERPRINT")).toBe(true);
  });
});

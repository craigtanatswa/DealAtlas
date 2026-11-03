import { describe, expect, it } from "vitest";

import { sanitisePreviewText } from "@/lib/redaction/sanitize";

function clean(summary: string): string {
  const sanitised = sanitisePreviewText({
    previewTitle: "Facilities services for public sector bodies",
    previewSummary: summary,
    sourceParts: ["Facilities services for public sector bodies"],
  });
  if (!sanitised) {
    throw new Error("expected sanitised preview text");
  }
  return sanitised.previewSummary;
}

describe("sanitisePreviewText", () => {
  it("removes TED S-series notices and standalone 8-digit ids", () => {
    const summary = clean(
      "Reference 2026/S 123-456789 and identifier 87654321 apply to this notice.",
    );

    expect(summary).not.toMatch(/2026\/S/i);
    expect(summary).not.toContain("123-456789");
    expect(summary).not.toContain("87654321");
  });

  it("removes .net, .ac.uk and .nhs.uk domains", () => {
    const summary = clean(
      "Visit example.net, buyer.ac.uk or portal.nhs.uk for the full supplier guidance and details.",
    );

    expect(summary).not.toContain("example.net");
    expect(summary).not.toContain("buyer.ac.uk");
    expect(summary).not.toContain("portal.nhs.uk");
  });

  it("removes named procurement portals", () => {
    const summary = clean(
      "Suppliers can find the full notice on Find a Tender, Contracts Finder, TED, Sell2Wales, Public Contracts Scotland, Delta eSourcing, ProContract, In-Tend, Jaggaer and Bravo for further guidance.",
    );

    for (const portal of [
      "Find a Tender",
      "Contracts Finder",
      "TED",
      "Sell2Wales",
      "Public Contracts Scotland",
      "Delta eSourcing",
      "ProContract",
      "In-Tend",
      "Jaggaer",
      "Bravo",
    ]) {
      expect(summary.toLowerCase()).not.toContain(portal.toLowerCase());
    }
  });
});

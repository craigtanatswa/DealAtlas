import { describe, expect, it } from "vitest";

import {
  exportActionAriaLabel,
  exportActionLabel,
  exportPaywallCaption,
  exportPaywallLabel,
} from "@/lib/exports/copy";

describe("export copy contexts", () => {
  it("uses shortlist paywall copy on Discover and Saved", () => {
    expect(exportPaywallLabel({ source: "filters" })).toBe("Unlock this shortlist");
    expect(exportPaywallLabel({ source: "saved" })).toBe("Unlock this shortlist");
    expect(exportPaywallCaption({ source: "filters" })).toContain(
      "Exact titles, buyers, and deadlines",
    );
    expect(exportPaywallCaption({ source: "saved" })).toContain("spreadsheet");
    expect(exportPaywallCaption({ source: "filters" })).not.toContain("CSV");
  });

  it("uses generic unlock copy for a single Deal", () => {
    expect(exportPaywallLabel({ source: "dealIds", dealCount: 1 })).toBe(
      "Unlock export",
    );
    expect(exportPaywallCaption({ source: "dealIds", dealCount: 1 })).toContain(
      "Exact title, buyer, and deadline",
    );
  });

  it("treats multiple selected Deals as a shortlist", () => {
    expect(exportPaywallLabel({ source: "dealIds", dealCount: 3 })).toBe(
      "Unlock this shortlist",
    );
  });

  it("keeps the Pro action as Export CSV and names the file in the accessible label", () => {
    expect(exportActionLabel(false)).toBe("Export CSV");
    expect(exportActionLabel(true)).toBe("Exporting…");
    expect(exportActionAriaLabel({ source: "filters" })).toBe(
      "Export matching opportunities as CSV",
    );
    expect(exportActionAriaLabel({ source: "saved" })).toBe(
      "Export saved opportunities as CSV",
    );
    expect(exportActionAriaLabel({ source: "dealIds", dealCount: 1 })).toBe(
      "Export this opportunity as CSV",
    );
  });
});

import { describe, expect, it } from "vitest";

import {
  findKeywordMatches,
  normalizeKeyword,
  prefilterOpportunity,
} from "@/ingestion/discovery/keywords";

describe("discovery pre-filter", () => {
  it("normalises keywords for matching", () => {
    expect(normalizeKeyword("  Request-for-Proposal! ")).toBe("request for proposal");
    expect(findKeywordMatches("We have an RFQ for grounds maintenance", ["rfq"])).toEqual([
      "rfq",
    ]);
  });

  it("passes a live procurement opportunity", () => {
    const result = prefilterOpportunity({
      title: "RFQ: grounds maintenance services",
      text: "We are seeking suppliers for a three year grounds maintenance contract. Submit your quotation by 30 June 2026.",
      keywords: ["rfq", "seeking suppliers"],
    });
    expect(result.classify).toBe(true);
    expect(result.onboarding).toBe(false);
    expect(result.disqualifiers).toEqual([]);
    expect(result.matchedKeywords).toEqual(["rfq", "seeking suppliers"]);
  });

  it("rejects jobs, press releases and award notices", () => {
    for (const text of [
      "Job vacancy: grounds maintenance operative. Apply for this job today.",
      "Press release: the council celebrates a new waste depot.",
      "Contract award notice: the contract was awarded to Acme Ltd.",
    ]) {
      const result = prefilterOpportunity({
        title: "Supplier opportunity",
        text,
        keywords: ["supplier opportunity"],
      });
      expect(result.classify).toBe(false);
      expect(result.disqualifiers.length).toBeGreaterThan(0);
    }
  });

  it("marks supplier onboarding for classification but never treats it as live", () => {
    const result = prefilterOpportunity({
      title: "Register as a supplier",
      text: "Supplier registration is open. Join our vendor registration portal.",
      keywords: ["supplier registration"],
    });
    expect(result.classify).toBe(true);
    expect(result.onboarding).toBe(true);
    expect(result.disqualifiers).toContain("supplier onboarding");
  });

  it("rejects pages with no procurement keyword", () => {
    const result = prefilterOpportunity({
      title: "About our procurement team",
      text: "Meet the team and read our strategy.",
      keywords: ["rfq", "itt"],
    });
    expect(result.classify).toBe(false);
    expect(result.reason).toBe("No procurement keyword matched");
  });
});

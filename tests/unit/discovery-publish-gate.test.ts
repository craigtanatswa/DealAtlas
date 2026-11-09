import { describe, expect, it } from "vitest";

import {
  autoPublishMayPublish,
  candidateApprovedForPublish,
} from "@/lib/deals/publish-gate";

const approvedCandidate = {
  status: "APPROVED",
  opportunityType: "RFQ",
  confidence: 95,
};

const allowedSource = {
  enabled: true,
  reuseStatus: "OPEN_LICENSE",
  scrapingPermitted: true,
  autoPublish: true,
  autoPublishMinConfidence: 90,
};

describe("discovery publish gate", () => {
  it("only publishes approved, non-onboarding candidates", () => {
    expect(candidateApprovedForPublish(approvedCandidate).allowed).toBe(true);
    expect(
      candidateApprovedForPublish({ ...approvedCandidate, status: "PENDING_REVIEW" }).allowed,
    ).toBe(false);
    expect(
      candidateApprovedForPublish({
        ...approvedCandidate,
        opportunityType: "SUPPLIER_ONBOARDING",
      }).allowed,
    ).toBe(false);
  });

  it("requires source enablement, compliance, opt-in and confidence", () => {
    expect(
      autoPublishMayPublish({ candidate: approvedCandidate, source: allowedSource }).allowed,
    ).toBe(true);
    expect(
      autoPublishMayPublish({
        candidate: approvedCandidate,
        source: { ...allowedSource, enabled: false },
      }).allowed,
    ).toBe(false);
    expect(
      autoPublishMayPublish({
        candidate: approvedCandidate,
        source: { ...allowedSource, reuseStatus: "UNKNOWN" },
      }).allowed,
    ).toBe(false);
    expect(
      autoPublishMayPublish({
        candidate: approvedCandidate,
        source: { ...allowedSource, autoPublish: false },
      }).allowed,
    ).toBe(false);
    expect(
      autoPublishMayPublish({
        candidate: { ...approvedCandidate, confidence: 70 },
        source: allowedSource,
      }).allowed,
    ).toBe(false);
  });

  it("never lowers the database confidence floor", () => {
    expect(
      autoPublishMayPublish({
        candidate: { ...approvedCandidate, confidence: 89 },
        source: { ...allowedSource, autoPublishMinConfidence: 50 },
      }).allowed,
    ).toBe(false);
  });
});

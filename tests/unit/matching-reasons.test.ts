import { describe, expect, it } from "vitest";

import {
  parseStoredDetailReasons,
  parseStoredReasons,
  sanitisedDetailReasons,
  sanitisedPreviewReasons,
} from "@/lib/matching/reasons";
import { dropLeakingReasons } from "@/lib/matching/sanitize";
import { scoreDealMatch } from "@/lib/matching/score";
import type { CompanyMatchProfile, MatchableDeal } from "@/lib/matching/types";
import { PREVIEW_REASON_LABELS } from "@/lib/matching/types";
import { findProtectedMarkerLeaks } from "../helpers/protected-leak";

const profile: CompanyMatchProfile = {
  companyDescription: "Cyber security assessments",
  productsServices: ["cyber"],
  preferredCategorySlugs: ["technology"],
  preferredCpvCodes: [],
  keywords: ["security"],
  negativeKeywords: ["asbestos"],
  preferredRegions: ["London"],
  minimumDealValue: null,
  maximumDealValue: null,
  certifications: ["Cyber Essentials"],
  frameworkMemberships: ["G-Cloud"],
  preferredBuyerSectors: ["PUBLIC"],
};

const deal: MatchableDeal = {
  dealId: "deal-protected",
  previewTitle: "Security capability for a public organisation",
  previewSummary: "A public organisation needs security assessments and support.",
  mainCategory: "Technology",
  broadRegion: "London",
  valueBand: "£100k–£250k",
  buyerSector: "PUBLIC",
  dealType: "FRAMEWORK",
  relevanceTags: ["security"],
  requirementsPreview: ["security/data-protection capability"],
  requirementNames: ["CANARY SOURCE TITLE NEVER FREE ISO evidence"],
  mandatoryRequirementTypes: ["COMPLIANCE"],
  commercialToolNames: ["CANARY BUYER NEVER FREE framework"],
};

describe("sanitised match reasons", () => {
  it("keeps preview reasons on canned labels without source identity", () => {
    const scored = scoreDealMatch(profile, deal);
    const preview = sanitisedPreviewReasons(scored.reasons, {
      limit: 6,
      includeMismatches: true,
    });
    const payload = JSON.stringify(preview);
    expect(findProtectedMarkerLeaks(payload)).toEqual([]);
    expect(payload).not.toContain("CANARY");
    expect(preview.every((reason) => PREVIEW_REASON_LABELS[reason.code] === reason.label)).toBe(
      true,
    );
  });

  it("keeps richer mismatch notes off the preview surface", () => {
    const scored = scoreDealMatch(profile, deal);
    const preview = sanitisedPreviewReasons(scored.reasons);
    const detail = sanitisedDetailReasons(scored.reasons);
    expect(preview.some((reason) => reason.code === "CERTIFICATION_GAP")).toBe(false);
    expect(preview.some((reason) => reason.code === "FRAMEWORK_GAP")).toBe(false);
    expect(detail.map((reason) => reason.code)).toEqual(
      expect.arrayContaining(["FRAMEWORK_GAP"]),
    );
    expect(JSON.stringify(detail)).not.toContain("CANARY SOURCE TITLE NEVER FREE");
  });

  it("drops reason labels that look like source identity", () => {
    const kept = dropLeakingReasons(
      [
        {
          code: "KEYWORD_OVERLAP",
          kind: "match",
          label: "Keyword overlap with the sanitised preview",
        },
        {
          code: "KEYWORD_OVERLAP",
          kind: "match",
          label: "Matches CANARY SOURCE TITLE NEVER FREE",
        },
        {
          code: "KEYWORD_OVERLAP",
          kind: "match",
          label: "See https://canary-source.example/notice",
        },
      ],
      {
        previewTitle: "Match reason",
        previewSummary: "",
        requirementsPreview: [],
        sourceTitle: "CANARY SOURCE TITLE NEVER FREE",
        sourceDescription: null,
        ocid: "ocds-canary-123456",
        reference: "CANARY-REF-987654",
        externalPrimaryId: null,
        sourceUrl: "https://canary-source.example/notice",
        applicationUrl: null,
        sourceName: null,
        sourceKey: null,
        buyerName: "CANARY BUYER NEVER FREE",
        buyerAliases: [],
        buyerDomain: "canary-protected.example",
        buyerEmail: null,
        buyerPhone: null,
        exactValueText: null,
        valueMinExVat: null,
        valueMaxExVat: null,
        submissionDeadline: null,
        exactLocationText: null,
      },
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]?.label).toContain("Keyword overlap");
  });

  it("renders canned labels only and drops unknown codes or kinds", () => {
    expect(
      parseStoredReasons([
        { code: "KEYWORD_OVERLAP", kind: "match", label: "Matches Pellingworth Borough Council history" },
        { code: "SECRET_SOURCE", kind: "match", label: "CANARY SOURCE TITLE NEVER FREE" },
        { code: "REGION_MATCH", kind: "sideways", label: "Pellingworth depot" },
        { code: "REGION_MISMATCH", kind: "mismatch" },
      ]),
    ).toEqual([
      { code: "KEYWORD_OVERLAP", kind: "match", label: PREVIEW_REASON_LABELS.KEYWORD_OVERLAP },
      { code: "REGION_MISMATCH", kind: "mismatch", label: PREVIEW_REASON_LABELS.REGION_MISMATCH },
    ]);
  });

  it("keeps stored labels for Pro detail reasons only", () => {
    expect(
      parseStoredDetailReasons([{ code: "VALUE_OUT_OF_RANGE", kind: "mismatch", label: "Exact value is above your maximum" }]),
    ).toEqual([{ code: "VALUE_OUT_OF_RANGE", kind: "mismatch", label: "Exact value is above your maximum" }]);
  });
});

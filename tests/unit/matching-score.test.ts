import { describe, expect, it } from "vitest";

import {
  cosineSimilarity,
  embeddingConfigFromEnv,
  similarityToScore,
} from "@/lib/matching/embeddings";
import { scoreDealMatch, type CompanyMatchProfile, type MatchableDeal } from "@/lib/matching";

const baseProfile: CompanyMatchProfile = {
  companyDescription: "Managed IT support and cloud platforms for public sector buyers.",
  productsServices: ["managed IT support", "cloud hosting"],
  preferredCategorySlugs: ["technology"],
  preferredCpvCodes: ["72000000"],
  keywords: ["cloud", "support"],
  negativeKeywords: [],
  preferredRegions: ["South East England"],
  minimumDealValue: 100_000,
  maximumDealValue: 600_000,
  certifications: ["ISO 27001"],
  frameworkMemberships: [],
  preferredBuyerSectors: ["PUBLIC"],
};

const baseDeal: MatchableDeal = {
  dealId: "deal-1",
  previewTitle: "Managed cloud support for a public organisation",
  previewSummary: "A public organisation needs ongoing cloud and IT support.",
  mainCategory: "Technology",
  broadRegion: "South East England",
  valueBand: "£250k–£500k",
  buyerSector: "PUBLIC",
  dealType: "PUBLIC_TENDER",
  relevanceTags: ["cloud", "it-support"],
  requirementsPreview: ["security/data-protection capability"],
  cpvCodes: ["72222300"],
  valueMinExVat: 250_000,
  valueMaxExVat: 400_000,
};

describe("deal matching scores", () => {
  it("scores a strong category, keyword, region, value and sector overlap highly", () => {
    const result = scoreDealMatch(baseProfile, baseDeal);
    expect(result.relevanceScore).toBeGreaterThanOrEqual(70);
    expect(result.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        "CATEGORY_OVERLAP",
        "CPV_OVERLAP",
        "KEYWORD_OVERLAP",
        "REGION_MATCH",
        "VALUE_IN_RANGE",
        "SECTOR_MATCH",
      ]),
    );
    expect(result.components.semantic).toBeNull();
  });

  it("reduces scores when a negative keyword matches", () => {
    const good = scoreDealMatch(baseProfile, baseDeal);
    const blocked = scoreDealMatch(
      { ...baseProfile, negativeKeywords: ["cloud"] },
      baseDeal,
    );
    expect(blocked.relevanceScore).toBeLessThan(good.relevanceScore - 20);
    expect(blocked.reasons.some((reason) => reason.code === "NEGATIVE_KEYWORD")).toBe(true);
    expect(blocked.components.keyword).toBe(0);
  });

  it("does not use semantic similarity unless a score is supplied", () => {
    const without = scoreDealMatch(baseProfile, baseDeal);
    const withSemantic = scoreDealMatch(baseProfile, baseDeal, { semanticScore: 88 });
    expect(without.components.semantic).toBeNull();
    expect(withSemantic.components.semantic).toBe(88);
    expect(withSemantic.reasons.some((reason) => reason.code === "SEMANTIC_SIMILARITY")).toBe(
      true,
    );
  });

  it("treats an empty profile as limited and mid-range", () => {
    const empty: CompanyMatchProfile = {
      companyDescription: null,
      productsServices: [],
      preferredCategorySlugs: [],
      preferredCpvCodes: [],
      keywords: [],
      negativeKeywords: [],
      preferredRegions: [],
      minimumDealValue: null,
      maximumDealValue: null,
      certifications: [],
      frameworkMemberships: [],
      preferredBuyerSectors: [],
    };
    const result = scoreDealMatch(empty, baseDeal);
    expect(result.relevanceScore).toBeLessThanOrEqual(50);
    expect(result.reasons.some((reason) => reason.code === "PROFILE_LIMITED")).toBe(true);
  });

  it("marks value and region mismatches", () => {
    const result = scoreDealMatch(baseProfile, {
      ...baseDeal,
      broadRegion: "Scotland",
      valueBand: "Under £25k",
      valueMinExVat: 10_000,
      valueMaxExVat: 20_000,
    });
    expect(result.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining(["REGION_MISMATCH", "VALUE_OUT_OF_RANGE"]),
    );
    expect(result.relevanceScore).toBeLessThan(60);
  });
});

describe("embedding helpers", () => {
  it("requires an embedding model and API key before enabling semantic matching", () => {
    expect(
      embeddingConfigFromEnv({
        DEALATLAS_LLM_API_KEY: "sk-test",
      }),
    ).toBeNull();
    expect(
      embeddingConfigFromEnv({
        DEALATLAS_EMBEDDING_MODEL: "text-embedding-3-small",
        DEALATLAS_LLM_API_KEY: "sk-test",
      }),
    ).toMatchObject({
      model: "text-embedding-3-small",
      apiKey: "sk-test",
    });
  });

  it("maps cosine similarity into a 0-100 score", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(similarityToScore(0.8)).toBe(80);
  });
});

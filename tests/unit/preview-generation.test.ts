import { describe, expect, it, vi } from "vitest";

import { runIngestion } from "@/ingestion/core/pipeline";
import { persistIntelligenceAndPreview } from "@/ingestion/preview/publish";
import { contextFromCandidate } from "@/ingestion/intelligence/types";
import type { LanguageModelProvider } from "@/ingestion/intelligence/provider";
import { createFindATenderAdapter } from "@/ingestion/sources/find-a-tender/adapter";
import { findATenderSourceRecord } from "@/ingestion/sources/find-a-tender/seed";
import { createMemoryIngestionStore } from "@/ingestion/store/memory";
import {
  createFixtureHttpClient,
  packageFromFixtures,
} from "@/tests/helpers/ingestion-fixtures";

const leakDrafts = vi.hoisted(() => ({ enabled: false }));

vi.mock("@/ingestion/preview/generate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ingestion/preview/generate")>();
  return {
    ...actual,
    async generatePreviewDraft(
      ...args: Parameters<typeof actual.generatePreviewDraft>
    ) {
      const draft = await actual.generatePreviewDraft(...args);
      if (!leakDrafts.enabled) {
        return draft;
      }
      return {
        ...draft,
        previewTitle: `Example City Council ${draft.previewTitle}`,
        previewSummary: `https://www.find-tender.service.gov.uk/Notice/000001-2026 ${draft.previewSummary}`,
        leakageRisk: "HIGH" as const,
        findings: [
          {
            code: "BUYER_NAME" as const,
            risk: "HIGH" as const,
            detail: "seeded leak",
            token: "Example City Council",
          },
        ],
      };
    },
  };
});

const NOW = new Date("2026-09-10T12:00:00.000Z");

async function ingestNormal() {
  const store = createMemoryIngestionStore({
    sources: [findATenderSourceRecord({ id: "source-fat" })],
  });
  const adapter = createFindATenderAdapter({
    http: createFixtureHttpClient(() => packageFromFixtures(["normal.json"])),
    now: () => NOW,
  });
  const result = await runIngestion({
    sourceKey: "find-a-tender",
    store,
    adapter,
    now: NOW,
    limit: 1,
    triggerType: "TEST",
  });
  return { store, result };
}

describe("preview generation from canonical records", () => {
  it("publishes a useful LOW-risk preview without source identity", async () => {
    const { store, result } = await ingestNormal();
    expect(result.status).toBe("SUCCEEDED");
    expect(result.counters.previewsPublished).toBe(1);
    expect(result.counters.previewsBlocked).toBe(0);
    expect(store.previews).toHaveLength(1);

    const preview = store.previews[0]!;
    const deal = store.deals[0]!;
    const combined = `${preview.previewTitle} ${preview.previewSummary} ${preview.requirementsPreview.join(" ")}`;

    expect(preview.isPublished).toBe(true);
    expect(preview.leakageRisk).toBe("LOW");
    expect(preview.previewTitle.length).toBeGreaterThan(12);
    expect(preview.previewSummary.length).toBeGreaterThan(24);
    expect(preview.valueBand).toBe("£250k–£500k");
    expect(preview.deadlineBand).toBe("Within 30 days");
    expect(preview.broadRegion).toBe("North West England");
    expect(preview.smeSuitability).toBe("HIGH");
    expect(preview.previewTitle.toLowerCase()).not.toBe(deal.sourceTitle.toLowerCase());
    expect(combined).not.toContain("Example City Council");
    expect(combined).not.toContain("ocds-h6vhtk-fixture1");
    expect(combined).not.toContain("REF-FIXTURE-1");
    expect(combined).not.toMatch(/https?:\/\//i);
    expect(combined.toLowerCase()).not.toContain("find a tender");
    expect(combined).not.toContain("Manchester");
    expect(combined).not.toContain("£250,000");
  });

  it("stores paid intelligence with per-field provenance", async () => {
    const { store } = await ingestNormal();
    const insight = store.insights[0];
    expect(insight).toBeTruthy();
    expect(insight?.summary).toBeTruthy();
    expect(insight?.generationMethod).toBe("RULES");
    expect(insight?.modelVersion).toContain("dealatlas-rules");
    const provenance = insight?.fieldProvenance as Record<string, { confidence?: number; method?: string }>;
    expect(provenance.summary?.method).toBe("RULES");
    expect(typeof provenance.summary?.confidence).toBe("number");
    expect(provenance.smeAccessibility?.confidence).toBeGreaterThan(0.5);
  });

  it("does not let model output override deterministic leak checks", async () => {
    const { store } = await ingestNormal();
    const deal = store.deals[0]!;
    const source = store.sources[0]!;
    const buyer = store.organizations[0]!;
    const leaking: LanguageModelProvider = {
      id: "llm",
      model: "leaky-test",
      version: "0",
      async generate() {
        return {
          text: "Example City Council tender at https://www.find-tender.service.gov.uk/Notice/000001-2026",
          providerId: "llm",
          model: "leaky-test",
          version: "0",
        };
      },
    };

    const outcome = await persistIntelligenceAndPreview({
      store,
      provider: leaking,
      context: contextFromCandidate({
        deal,
        source,
        buyer,
        buyerAliases: ["Example Council"],
        lots: store.lots,
        candidate: {
          sourceKey: "find-a-tender",
          ocid: deal.ocid ?? "",
          externalPrimaryId: deal.externalPrimaryId ?? "",
          noticeIdentifier: "000001-2026",
          releaseId: "000001-2026",
          reference: deal.reference,
          sourceTitle: deal.sourceTitle,
          sourceDescription: deal.sourceDescription,
          sourceUrl: deal.sourceUrl ?? "",
          dealType: deal.dealType,
          buyerSector: deal.buyerSector,
          stage: deal.stage,
          status: deal.status,
          mainCategory: deal.mainCategory,
          currency: deal.currency ?? "GBP",
          valueMinExVat: deal.valueMinExVat,
          valueMaxExVat: deal.valueMaxExVat,
          exactValueText: deal.exactValueText,
          exactLocationText: deal.exactLocationText,
          submissionDeadline: deal.submissionDeadline,
          organizations: [],
          lots: [],
          requirements: [],
          awardCriteria: [],
          awards: [],
          contracts: [],
          documents: [],
          classifications: [],
          relatedOcids: [],
        },
        now: NOW,
      }),
    });

    const combined = `${outcome.previewTitle} ${outcome.previewSummary}`;
    expect(combined).not.toContain("Example City Council");
    expect(combined).not.toContain("find-tender.service.gov.uk");
    if (outcome.published) {
      expect(outcome.leakageRisk).toBe("LOW");
    } else {
      expect(outcome.leakageRisk).not.toBe("LOW");
    }
  });

  it("keeps REVIEW/HIGH drafts unpublished after regeneration", async () => {
    const { store } = await ingestNormal();
    const deal = store.deals[0]!;
    leakDrafts.enabled = true;
    try {
      const outcome = await persistIntelligenceAndPreview({
        store,
        context: contextFromCandidate({
          deal,
          source: store.sources[0]!,
          buyer: store.organizations[0]!,
          buyerAliases: ["Example Council"],
          lots: store.lots,
          candidate: {
            sourceKey: "find-a-tender",
            ocid: deal.ocid ?? "",
            externalPrimaryId: deal.externalPrimaryId ?? "",
            noticeIdentifier: "000001-2026",
            releaseId: "000001-2026",
            reference: deal.reference,
            sourceTitle: deal.sourceTitle,
            sourceDescription: deal.sourceDescription,
            sourceUrl: deal.sourceUrl ?? "",
            dealType: deal.dealType,
            buyerSector: deal.buyerSector,
            stage: deal.stage,
            status: deal.status,
            mainCategory: deal.mainCategory,
            currency: deal.currency ?? "GBP",
            valueMinExVat: deal.valueMinExVat,
            valueMaxExVat: deal.valueMaxExVat,
            exactValueText: deal.exactValueText,
            exactLocationText: deal.exactLocationText,
            submissionDeadline: deal.submissionDeadline,
            organizations: [],
            lots: [],
            requirements: [],
            awardCriteria: [],
            awards: [],
            contracts: [],
            documents: [],
            classifications: [],
            relatedOcids: [],
          },
          now: NOW,
        }),
      });

      expect(outcome.published).toBe(false);
      expect(outcome.leakageRisk).toBe("HIGH");
      expect(outcome.attempts).toBeGreaterThanOrEqual(2);
      expect(store.previews[0]?.isPublished).toBe(false);
      expect(store.previewRuns.some((run) => !run.isPublished)).toBe(true);
    } finally {
      leakDrafts.enabled = false;
    }
  });
});

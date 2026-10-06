import { randomBytes } from "node:crypto";

import { extractDealIntelligence } from "@/ingestion/intelligence/extract";
import type { LanguageModelProvider } from "@/ingestion/intelligence/provider";
import { createRulesLanguageModel } from "@/ingestion/intelligence/provider";
import type {
  DealIntelligence,
  IntelligenceContext,
  PreviewDraft,
  PreviewPublishResult,
} from "@/ingestion/intelligence/types";
import {
  generatePreviewDraft,
  leakScanInputFromContext,
} from "@/ingestion/preview/generate";
import { buildPreviewSlug, isTemplatePreviewSlug } from "@/lib/deals/public-slug";
import { scanPreviewLeaks } from "@/lib/redaction/scan";
import type {
  DealInsightRecord,
  DealPreviewRecord,
  IngestionStore,
  PreviewGenerationRunRecord,
} from "@/ingestion/store/types";

function toJson(value: unknown): DealInsightRecord["fieldProvenance"] {
  return JSON.parse(JSON.stringify(value)) as DealInsightRecord["fieldProvenance"];
}

async function allocatePreviewSlug(
  store: IngestionStore,
  title: string,
  dealId: string,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = buildPreviewSlug(title, randomBytes(4).toString("hex"));
    if (!(await store.previewSlugInUse(slug, dealId))) return slug;
  }
  return buildPreviewSlug(title, randomBytes(4).toString("hex"));
}

function insightRecord(dealId: string, intelligence: DealIntelligence): DealInsightRecord {
  return {
    dealId,
    summary: intelligence.summary,
    buyerNeed: intelligence.buyerNeed,
    idealSupplier: intelligence.idealSupplier,
    keyDeliverables: intelligence.keyDeliverables,
    mandatoryRequirements: intelligence.mandatoryRequirements,
    competitionNotes: intelligence.competitionNotes,
    smeAccessibility: intelligence.smeAccessibility,
    bidComplexity: intelligence.bidComplexity,
    competitionLevel: intelligence.competitionLevel,
    deadlineUrgency: intelligence.deadlineUrgency,
    riskFlags: intelligence.riskFlags,
    estimatedRenewalDate: intelligence.estimatedRenewalDate,
    incumbentOrganizationId: intelligence.incumbentOrganizationId,
    confidence: intelligence.overallConfidence,
    generationMethod: intelligence.generationMethod,
    modelVersion: intelligence.modelVersion,
    fieldProvenance: toJson(intelligence.fieldProvenance),
    generatedAt: intelligence.generatedAt,
  };
}

/** Same gate retry live publish uses: a non-LOW draft is rebuilt aggressively. */
export async function generatePreviewDraftWithGateRetry(
  context: IntelligenceContext,
): Promise<{ draft: PreviewDraft; attempts: number }> {
  let draft = await generatePreviewDraft(context);
  if (draft.leakageRisk === "LOW") {
    return { draft, attempts: 1 };
  }
  draft = await generatePreviewDraft(context, { aggressive: true });
  return { draft, attempts: 2 };
}

export async function persistIntelligenceAndPreview(options: {
  store: IngestionStore;
  context: IntelligenceContext;
  provider?: LanguageModelProvider;
  /** auto may publish a LOW preview. preserve never turns is_published on. */
  publication?: "auto" | "preserve";
}): Promise<PreviewPublishResult> {
  const provider = options.provider ?? createRulesLanguageModel();
  const { store, context } = options;
  const intelligence = await extractDealIntelligence(context, provider);

  const gated = await generatePreviewDraftWithGateRetry(context);
  const draft = gated.draft;
  const attempts = gated.attempts;

  const existing = await store.getDealPreview(context.deal.id);
  const keptSlug =
    existing?.slug && isTemplatePreviewSlug(existing.slug, draft.previewTitle)
      ? existing.slug
      : null;
  const slug = keptSlug ?? (await allocatePreviewSlug(store, draft.previewTitle, context.deal.id));
  if (!keptSlug && existing?.slug && existing.slug !== slug) {
    await store.retirePreviewSlug(existing.slug);
  }
  const finalScan = scanPreviewLeaks(
    leakScanInputFromContext(context, draft, { slug, broadRegion: draft.broadRegion }),
  );
  const leakageRisk = finalScan.risk;
  const unpublishedByAdmin = existing?.unpublishedByAdmin === true;
  const gatePublished = leakageRisk === "LOW" && !unpublishedByAdmin;
  const published =
    options.publication === "preserve"
      ? existing?.isPublished === true && gatePublished
      : gatePublished;

  const preview: DealPreviewRecord = {
    dealId: context.deal.id,
    slug,
    previewTitle: draft.previewTitle,
    previewSummary: draft.previewSummary,
    dealType: context.deal.dealType,
    buyerSector: context.deal.buyerSector,
    stage: context.deal.stage,
    status: context.deal.status,
    mainCategory: context.deal.mainCategory,
    broadRegion: draft.broadRegion,
    valueBand: draft.valueBand,
    deadlineBand: draft.deadlineBand,
    durationBand: draft.durationBand,
    smeSuitability: draft.smeSuitability,
    bidComplexity: draft.bidComplexity,
    competitionLevel: draft.competitionLevel,
    requirementsPreview: draft.requirementsPreview,
    relevanceTags: draft.relevanceTags,
    freshnessLabel: draft.freshnessLabel,
    leakageRisk,
    isPublished: published,
    unpublishedByAdmin,
  };

  await store.upsertDealInsight(insightRecord(context.deal.id, intelligence));
  const saved = await store.upsertDealPreview(preview);

  const run: Omit<PreviewGenerationRunRecord, "id"> = {
    dealId: context.deal.id,
    attemptNumber: attempts,
    leakageRisk: saved.leakageRisk,
    isPublished: saved.isPublished,
    findings: finalScan.findings,
    generationMethod: intelligence.generationMethod,
    modelVersion: intelligence.modelVersion,
    previewTitle: saved.previewTitle,
    previewSummary: saved.previewSummary,
    createdAt: context.now.toISOString(),
  };
  await store.insertPreviewGenerationRun(run);

  return {
    published: saved.isPublished && saved.leakageRisk === "LOW",
    leakageRisk: saved.leakageRisk,
    previewTitle: saved.previewTitle,
    previewSummary: saved.previewSummary,
    slug: saved.slug,
    findings: finalScan.findings,
    attempts,
    intelligence,
  };
}

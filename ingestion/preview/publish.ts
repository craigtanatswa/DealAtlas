import { extractDealIntelligence } from "@/ingestion/intelligence/extract";
import type { LanguageModelProvider } from "@/ingestion/intelligence/provider";
import { createRulesLanguageModel } from "@/ingestion/intelligence/provider";
import type {
  DealIntelligence,
  IntelligenceContext,
  PreviewPublishResult,
} from "@/ingestion/intelligence/types";
import { generatePreviewDraft } from "@/ingestion/preview/generate";
import { scanPreviewLeaks, type LeakScanInput } from "@/lib/redaction/scan";
import type {
  DealInsightRecord,
  DealPreviewRecord,
  IngestionStore,
  PreviewGenerationRunRecord,
} from "@/ingestion/store/types";

function toJson(value: unknown): DealInsightRecord["fieldProvenance"] {
  return JSON.parse(JSON.stringify(value)) as DealInsightRecord["fieldProvenance"];
}

function slugifyPreview(title: string, dealId: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = dealId.replace(/-/g, "").slice(0, 8);
  return `${base || "opportunity"}-${suffix}`;
}

function leakInputFrom(
  context: IntelligenceContext,
  title: string,
  summary: string,
  requirements: string[],
  tags: string[],
): LeakScanInput {
  return {
    previewTitle: title,
    previewSummary: summary,
    requirementsPreview: requirements,
    relevanceTags: tags,
    sourceTitle: context.deal.sourceTitle,
    sourceDescription: context.deal.sourceDescription,
    ocid: context.deal.ocid,
    reference: context.deal.reference,
    externalPrimaryId: context.deal.externalPrimaryId,
    noticeIdentifiers: context.noticeIdentifiers,
    sourceUrl: context.deal.sourceUrl,
    applicationUrl: context.deal.applicationUrl,
    sourceName: context.source.name,
    sourceKey: context.source.sourceKey,
    buyerName: context.buyer?.canonicalName ?? null,
    buyerAliases: context.buyerAliases,
    buyerDomain: context.buyer?.domain ?? null,
    buyerEmail: context.buyer?.email ?? null,
    buyerPhone: context.buyer?.phone ?? null,
    exactValueText: context.deal.exactValueText,
    valueMinExVat: context.deal.valueMinExVat,
    valueMaxExVat: context.deal.valueMaxExVat,
    submissionDeadline: context.deal.submissionDeadline,
    exactLocationText: context.deal.exactLocationText,
  };
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

export async function persistIntelligenceAndPreview(options: {
  store: IngestionStore;
  context: IntelligenceContext;
  provider?: LanguageModelProvider;
}): Promise<PreviewPublishResult> {
  const provider = options.provider ?? createRulesLanguageModel();
  const { store, context } = options;
  const intelligence = await extractDealIntelligence(context, provider);

  let draft = await generatePreviewDraft(context, { provider });
  let attempts = 1;
  if (draft.leakageRisk !== "LOW") {
    draft = await generatePreviewDraft(context, { provider: createRulesLanguageModel(), aggressive: true });
    attempts += 1;
  }

  const finalScan = scanPreviewLeaks(
    leakInputFrom(
      context,
      draft.previewTitle,
      draft.previewSummary,
      draft.requirementsPreview,
      draft.relevanceTags,
    ),
  );
  const leakageRisk = finalScan.risk;
  const published = leakageRisk === "LOW";

  const existing = await store.getDealPreview(context.deal.id);
  const slug = existing?.slug ?? slugifyPreview(draft.previewTitle, context.deal.id);

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

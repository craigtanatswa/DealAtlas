import {
  deadlineBandFromDeadline,
  durationBandFromDates,
  valueBandFromAmounts,
} from "@/lib/preview/bands";
import { composeFreePreview, encodePreviewDetails } from "@/lib/preview/compose";
import { broadRegionFromLocation } from "@/lib/preview/region";
import {
  scanPreviewLeaks,
  type LeakScanInput,
} from "@/lib/redaction/scan";
import { DEAL_TYPE_LABELS } from "@/lib/search/filters";
import {
  inferBidComplexity,
  inferCompetitionLevel,
  inferSmeSuitability,
} from "@/ingestion/intelligence/extract";
import type { LanguageModelProvider } from "@/ingestion/intelligence/provider";
import { RULES_MODEL } from "@/ingestion/intelligence/types";
import type {
  IntelligenceContext,
  PreviewDraft,
} from "@/ingestion/intelligence/types";

import { REQUIREMENT_PREVIEW_LABELS } from "@/lib/preview/labels";

export { REQUIREMENT_PREVIEW_LABELS };

export type RequirementPreviewLabel = (typeof REQUIREMENT_PREVIEW_LABELS)[number];

export function generalizeRequirementText(name: string, description?: string | null): RequirementPreviewLabel | null {
  const blob = `${name} ${description ?? ""}`.toLowerCase();
  if (/turnover|credit rating|financial/.test(blob)) return "financial capacity evidence";
  if (/iso\s*27001|cyber|information security|security clear/.test(blob)) {
    return "information-security capability";
  }
  if (/insur/.test(blob)) return "appropriate insurance cover";
  if (/gdpr|data protection/.test(blob)) return "data-protection capability";
  if (/experience|comparable|reference project|case stud/.test(blob)) {
    return "evidence of comparable delivery";
  }
  if (/social value/.test(blob)) return "social value contribution";
  if (/support|maintenance|service desk/.test(blob)) return "ongoing support capability";
  if (/implementation|mobilisation|mobilization/.test(blob)) return "implementation and mobilisation capability";
  return null;
}

export function requirementsPreviewFromContext(
  context: IntelligenceContext,
  limit = 4,
): string[] {
  const items = context.requirements
    .map((item) => generalizeRequirementText(item.name, item.description))
    .filter((item): item is RequirementPreviewLabel => item !== null);
  return [...new Set(items)].slice(0, limit);
}

function freshnessLabel(context: IntelligenceContext): string {
  const published = context.deal.firstPublishedAt
    ? new Date(context.deal.firstPublishedAt)
    : null;
  const latest = context.deal.latestSourceAt ? new Date(context.deal.latestSourceAt) : null;
  const week = 7 * 86_400_000;
  if (published && context.now.getTime() - published.getTime() <= week) {
    return "New this week";
  }
  if (latest && context.now.getTime() - latest.getTime() <= week) {
    return "Updated this week";
  }
  return "Open opportunity";
}

function relevanceTags(context: IntelligenceContext): string[] {
  const tags = [
    context.deal.mainCategory,
    DEAL_TYPE_LABELS[context.deal.dealType],
    context.deal.smeSuitable ? "SME-friendly" : null,
  ].filter((item): item is string => Boolean(item));
  return [...new Set(tags)].slice(0, 6);
}

export function buildPreviewTitle(context: IntelligenceContext, aggressive = false): string {
  return composeFreePreview(context, aggressive).title;
}

export function buildPreviewSummary(context: IntelligenceContext, aggressive = false): string {
  return composeFreePreview(context, aggressive).summary;
}

export function leakScanInputFromContext(
  context: IntelligenceContext,
  draft: Pick<PreviewDraft, "previewTitle" | "previewSummary" | "requirementsPreview" | "relevanceTags">,
  extra: Pick<LeakScanInput, "slug" | "broadRegion"> = {},
): LeakScanInput {
  const { deal, lots, buyer } = context;
  return {
    previewTitle: draft.previewTitle,
    previewSummary: draft.previewSummary,
    requirementsPreview: draft.requirementsPreview,
    relevanceTags: draft.relevanceTags,
    slug: extra.slug ?? null,
    broadRegion: extra.broadRegion ?? null,
    sourceTitle: deal.sourceTitle,
    sourceDescription: deal.sourceDescription,
    sourceExtraText: [
      ...lots.flatMap((lot) => [lot.sourceTitle, lot.sourceDescription]),
      ...context.requirements.flatMap((item) => [item.name, item.description]),
    ].filter((item): item is string => Boolean(item)),
    ocid: deal.ocid,
    reference: deal.reference,
    externalPrimaryId: deal.externalPrimaryId,
    noticeIdentifiers: context.noticeIdentifiers,
    extraReferences: lots
      .map((lot) => lot.sourceLotId)
      .filter((item): item is string => Boolean(item)),
    sourceUrl: deal.sourceUrl,
    applicationUrl: deal.applicationUrl,
    sourceName: context.source.name,
    sourceKey: context.source.sourceKey,
    buyerName: buyer?.canonicalName ?? null,
    buyerAliases: context.buyerAliases,
    buyerDomain: buyer?.domain ?? null,
    buyerWebsite: buyer?.website ?? null,
    buyerEmail: buyer?.email ?? null,
    buyerPhone: buyer?.phone ?? null,
    exactValueText: deal.exactValueText,
    valueMinExVat: deal.valueMinExVat,
    valueMaxExVat: deal.valueMaxExVat,
    sourceAmounts: lots.flatMap((lot) => [lot.valueMin, lot.valueMax]),
    submissionDeadline: deal.submissionDeadline,
    sourceDates: [
      deal.enquiryDeadline,
      deal.firstPublishedAt,
      deal.awardDecisionDate,
      deal.contractStartDate,
      deal.contractEndDate,
      deal.extensionEndDate,
      deal.nextProcurementDate,
      deal.estimatedRenewalDate,
      ...lots.flatMap((lot) => [lot.submissionDeadline, lot.contractStartDate, lot.contractEndDate]),
    ],
    exactLocationText: deal.exactLocationText,
    lotLocationTexts: lots.map((lot) => lot.exactLocationText),
    locationTerms: [buyer?.city ?? null, buyer?.addressLine1 ?? null],
    knownPostcodes: [buyer?.postcode ?? null],
  };
}

function leakInput(
  context: IntelligenceContext,
  draft: Pick<PreviewDraft, "previewTitle" | "previewSummary" | "requirementsPreview" | "relevanceTags">,
): LeakScanInput {
  return leakScanInputFromContext(context, draft);
}

function assembleDraft(
  context: IntelligenceContext,
  aggressive: boolean,
  generationMethod: PreviewDraft["generationMethod"],
  modelVersion: string,
): PreviewDraft {
  const sme = inferSmeSuitability(context).level;
  const complexity = inferBidComplexity(context).level;
  const competition = inferCompetitionLevel(context).level;
  const composed = composeFreePreview(context, aggressive);
  const requirements = [
    ...encodePreviewDetails(composed.details),
    ...requirementsPreviewFromContext(context, aggressive ? 2 : 4),
  ];
  const tags = relevanceTags(context);
  const draft = {
    previewTitle: composed.title,
    previewSummary: composed.summary,
    requirementsPreview: requirements,
    relevanceTags: tags,
  };
  const scan = scanPreviewLeaks(leakInput(context, draft));
  const region = broadRegionFromLocation([
    context.deal.exactLocationText,
    ...context.lots.map((lot) => lot.exactLocationText),
  ]);
  return {
    previewTitle: draft.previewTitle,
    previewSummary: draft.previewSummary,
    broadRegion: region,
    valueBand: valueBandFromAmounts(context.deal.valueMinExVat, context.deal.valueMaxExVat),
    deadlineBand: deadlineBandFromDeadline(
      context.deal.submissionDeadline,
      context.now,
      context.deal.status,
    ),
    durationBand: durationBandFromDates(
      context.deal.contractStartDate,
      context.deal.contractEndDate,
      context.deal.extensionEndDate,
    ),
    smeSuitability: sme,
    bidComplexity: complexity,
    competitionLevel: competition,
    requirementsPreview: draft.requirementsPreview,
    relevanceTags: tags,
    freshnessLabel: freshnessLabel(context),
    leakageRisk: scan.risk,
    findings: scan.findings,
    generationMethod,
    modelVersion,
  };
}

export async function generatePreviewDraft(
  context: IntelligenceContext,
  options?: {
    provider?: LanguageModelProvider;
    aggressive?: boolean;
  },
): Promise<PreviewDraft> {
  // Free and anonymous copy is template-only. Model output is not a preview source.
  void options?.provider;
  const aggressive = options?.aggressive ?? false;
  let draft = assembleDraft(
    context,
    aggressive,
    "RULES",
    `${RULES_MODEL.id}/${RULES_MODEL.version}`,
  );

  if (draft.leakageRisk !== "LOW") {
    const rescan = scanPreviewLeaks(
      leakInput(context, {
        previewTitle: draft.previewTitle,
        previewSummary: draft.previewSummary,
        requirementsPreview: draft.requirementsPreview,
        relevanceTags: draft.relevanceTags,
      }),
    );
    draft = {
      ...draft,
      leakageRisk: rescan.risk,
      findings: rescan.findings,
    };
  }

  return draft;
}

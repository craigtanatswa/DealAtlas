import {
  deadlineBandFromDeadline,
  durationBandFromDates,
  valueBandFromAmounts,
} from "@/lib/preview/bands";
import { broadRegionFromLocation } from "@/lib/preview/region";
import {
  scanPreviewLeaks,
  type LeakFinding,
  type LeakScanInput,
} from "@/lib/redaction/scan";
import { DEAL_TYPE_LABELS } from "@/lib/search/filters";
import {
  inferBidComplexity,
  inferCompetitionLevel,
  inferSmeSuitability,
} from "@/ingestion/intelligence/extract";
import { createRulesLanguageModel } from "@/ingestion/intelligence/provider";
import type { LanguageModelProvider } from "@/ingestion/intelligence/provider";
import { RULES_MODEL, sectorOrganisationNoun } from "@/ingestion/intelligence/types";
import type {
  IntelligenceContext,
  PreviewDraft,
} from "@/ingestion/intelligence/types";

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL_RE = /\b[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}\b/gi;
const OCID_RE = /\bocds-[a-z0-9]{3,}-[a-z0-9\-]+\b/gi;
const PHONE_RE =
  /(?<!\d)(?:\+|00)?(?:44)[\s().-]*(?:\d[\s().-]*){9,11}(?!\d)|(?<!\d)0[\s().-]*(?:\d[\s().-]*){9,10}(?!\d)/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripPatternLeaks(text: string): string {
  return text
    .replace(URL_RE, "")
    .replace(EMAIL_RE, "")
    .replace(OCID_RE, "")
    .replace(PHONE_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripIdentity(text: string, context: IntelligenceContext): string {
  const replacements = [
    context.buyer?.canonicalName,
    ...context.buyerAliases,
    context.buyer?.domain,
    context.deal.ocid,
    context.deal.reference,
    context.deal.externalPrimaryId,
    context.source.name,
    context.source.sourceKey,
    ...context.noticeIdentifiers,
  ]
    .filter((item): item is string => Boolean(item && item.trim().length >= 3))
    .sort((left, right) => right.length - left.length);

  let next = stripPatternLeaks(text);
  const fallback = sectorOrganisationNoun(context.deal.buyerSector);
  for (const token of replacements) {
    next = next.replace(new RegExp(escapeRegExp(token), "gi"), fallback);
  }
  return next.replace(/\s+/g, " ").trim();
}

export function generalizeRequirementText(name: string, description?: string | null): string | null {
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
  const cleaned = name.replace(/\d[\d,]*/g, "").replace(/\s+/g, " ").trim();
  if (cleaned.length < 8 || cleaned.length > 80) {
    return "relevant domain capability";
  }
  return cleaned.toLowerCase();
}

export function requirementsPreviewFromContext(
  context: IntelligenceContext,
  limit = 4,
): string[] {
  const items = context.requirements
    .map((item) => generalizeRequirementText(item.name, item.description))
    .filter((item): item is string => Boolean(item));
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
  const category = context.deal.mainCategory || "Commercial";
  const typeNoun = DEAL_TYPE_LABELS[context.deal.dealType].toLowerCase();
  const sector = sectorOrganisationNoun(context.deal.buyerSector);
  if (aggressive) {
    return `${category} opportunity for a ${sector}`;
  }
  const region = broadRegionFromLocation([
    context.deal.exactLocationText,
    ...context.lots.map((lot) => lot.exactLocationText),
  ]);
  const regionClause =
    region && region !== "Nationwide" && region !== "Remote" ? ` in ${region}` : "";
  return `${category} ${typeNoun} for a ${sector}${regionClause}`;
}

export function buildPreviewSummary(context: IntelligenceContext, aggressive = false): string {
  const sector = sectorOrganisationNoun(context.deal.buyerSector);
  const category = context.deal.mainCategory?.toLowerCase() ?? "the advertised capability";
  const value = valueBandFromAmounts(context.deal.valueMinExVat, context.deal.valueMaxExVat);
  const deadline = deadlineBandFromDeadline(
    context.deal.submissionDeadline,
    context.now,
    context.deal.status,
  );
  const region = broadRegionFromLocation([
    context.deal.exactLocationText,
    ...context.lots.map((lot) => lot.exactLocationText),
  ]);
  const sme = inferSmeSuitability(context).level;
  if (aggressive) {
    return `A ${sector} is seeking ${category}. Value ${value}. ${deadline}.`;
  }
  const regionClause = region ? ` Coverage is described at ${region} level.` : "";
  const smeClause =
    sme === "HIGH"
      ? " The notice appears relatively accessible for SMEs."
      : sme === "LOW"
        ? " SME accessibility looks limited."
        : "";
  return `A ${sector} is seeking ${category} through a ${DEAL_TYPE_LABELS[context.deal.dealType].toLowerCase()}.${regionClause} Estimated value ${value}. Closing window: ${deadline}.${smeClause}`;
}

function leakInput(context: IntelligenceContext, draft: Pick<PreviewDraft, "previewTitle" | "previewSummary" | "requirementsPreview" | "relevanceTags">): LeakScanInput {
  return {
    previewTitle: draft.previewTitle,
    previewSummary: draft.previewSummary,
    requirementsPreview: draft.requirementsPreview,
    relevanceTags: draft.relevanceTags,
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

function applyFindingTokens(text: string, findings: LeakFinding[]): string {
  let next = text;
  for (const finding of findings) {
    if (finding.token && finding.token.length >= 3) {
      next = next.replace(new RegExp(escapeRegExp(finding.token), "gi"), "");
    }
  }
  return next.replace(/\s+/g, " ").trim();
}

async function maybeLlmRewrite(
  provider: LanguageModelProvider,
  purpose: "preview_title" | "preview_summary",
  fallback: string,
  context: IntelligenceContext,
): Promise<{ text: string; usedLlm: boolean; model: string; version: string }> {
  if (provider.id === "rules") {
    return { text: fallback, usedLlm: false, model: RULES_MODEL.id, version: RULES_MODEL.version };
  }
  try {
    const result = await provider.generate({
      purpose,
      system:
        "Write a sanitised DealAtlas preview. Never include buyer names, aliases, domains, URLs, emails, phones, OCIDs, notice IDs, source platform names, exact amounts, exact dates or exact addresses. Paraphrase. Keep it useful and generic.",
      prompt: `Purpose: ${purpose}\nFallback: ${fallback}\nCategory: ${context.deal.mainCategory ?? ""}\nType: ${context.deal.dealType}`,
    });
    const text = result?.text?.trim();
    if (!result || !text) {
      return { text: fallback, usedLlm: false, model: RULES_MODEL.id, version: RULES_MODEL.version };
    }
    const sanitized = stripIdentity(text, context);
    const scan = scanPreviewLeaks(
      leakInput(context, {
        previewTitle: purpose === "preview_title" ? sanitized : "Opportunity",
        previewSummary: purpose === "preview_summary" ? sanitized : "A sanitised summary.",
        requirementsPreview: [],
        relevanceTags: [],
      }),
    );
    if (scan.risk !== "LOW") {
      return { text: fallback, usedLlm: false, model: RULES_MODEL.id, version: RULES_MODEL.version };
    }
    return {
      text: sanitized,
      usedLlm: true,
      model: result.model,
      version: result.version,
    };
  } catch {
    return { text: fallback, usedLlm: false, model: RULES_MODEL.id, version: RULES_MODEL.version };
  }
}

function assembleDraft(
  context: IntelligenceContext,
  title: string,
  summary: string,
  aggressive: boolean,
  generationMethod: PreviewDraft["generationMethod"],
  modelVersion: string,
): PreviewDraft {
  const sme = inferSmeSuitability(context).level;
  const complexity = inferBidComplexity(context).level;
  const competition = inferCompetitionLevel(context).level;
  const requirements = requirementsPreviewFromContext(context, aggressive ? 2 : 4);
  const tags = relevanceTags(context);
  const cleanedTitle = stripIdentity(title, context);
  const cleanedSummary = stripIdentity(summary, context);
  const draft = {
    previewTitle: cleanedTitle,
    previewSummary: cleanedSummary,
    requirementsPreview: requirements.map((item) => stripIdentity(item, context)),
    relevanceTags: tags,
  };
  const firstScan = scanPreviewLeaks(leakInput(context, draft));
  const redacted = {
    previewTitle: applyFindingTokens(draft.previewTitle, firstScan.findings) || cleanedTitle,
    previewSummary: applyFindingTokens(draft.previewSummary, firstScan.findings) || cleanedSummary,
    requirementsPreview: draft.requirementsPreview
      .map((item) => applyFindingTokens(item, firstScan.findings))
      .filter(Boolean),
    relevanceTags: tags,
  };
  const scan = scanPreviewLeaks(leakInput(context, redacted));
  const region = broadRegionFromLocation([
    context.deal.exactLocationText,
    ...context.lots.map((lot) => lot.exactLocationText),
  ]);
  return {
    previewTitle: redacted.previewTitle,
    previewSummary: redacted.previewSummary,
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
    requirementsPreview: redacted.requirementsPreview,
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
  const provider = options?.provider ?? createRulesLanguageModel();
  const aggressive = options?.aggressive ?? false;
  const titleFallback = buildPreviewTitle(context, aggressive);
  const summaryFallback = buildPreviewSummary(context, aggressive);
  const title = await maybeLlmRewrite(provider, "preview_title", titleFallback, context);
  const summary = await maybeLlmRewrite(provider, "preview_summary", summaryFallback, context);
  const usedLlm = title.usedLlm || summary.usedLlm;
  let draft = assembleDraft(
    context,
    title.text,
    summary.text,
    aggressive,
    usedLlm ? "HYBRID" : "RULES",
    usedLlm ? `${title.model}/${title.version}` : `${RULES_MODEL.id}/${RULES_MODEL.version}`,
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
